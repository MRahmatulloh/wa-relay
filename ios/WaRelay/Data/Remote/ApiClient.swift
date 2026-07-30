import Foundation

struct AuthResult: Sendable {
    let token: String
    let username: String
}

struct MessagesPage: Sendable {
    let messages: [MatchedMessage]
    let hasMore: Bool
    let nextCursor: String?
}

struct MessageQuery: Sendable {
    var q: String? = nil
    var unread: Bool? = nil
    var starred: Bool? = nil
    var done: Bool? = nil
    var isGroup: Bool? = nil
    var folder: String? = nil
    var limit: Int = 40
    var before: String? = nil
}

enum ApiError: LocalizedError {
    case http(Int, String?)
    case unauthorized
    case invalidResponse
    case message(String)

    var errorDescription: String? {
        switch self {
        case .http(let code, let msg):
            return msg?.isEmpty == false ? msg : "HTTP \(code)"
        case .unauthorized:
            return "Unauthorized"
        case .invalidResponse:
            return "Invalid response"
        case .message(let msg):
            return msg
        }
    }
}

actor ApiClient {
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 45
        return URLSession(configuration: config)
    }()

    func login(username: String, password: String) async throws -> AuthResult {
        try await auth(path: "/auth/login", username: username, password: password)
    }

    func register(username: String, password: String) async throws -> AuthResult {
        try await auth(path: "/auth/register", username: username, password: password)
    }

    func fetchMessages(token: String, query: MessageQuery = MessageQuery()) async throws -> MessagesPage {
        var components = URLComponents(string: host() + "/messages")!
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(query.limit)),
        ]
        if let q = query.q, !q.isEmpty { items.append(URLQueryItem(name: "q", value: q)) }
        if let unread = query.unread { items.append(URLQueryItem(name: "unread", value: String(unread))) }
        if let starred = query.starred { items.append(URLQueryItem(name: "starred", value: String(starred))) }
        if let done = query.done { items.append(URLQueryItem(name: "done", value: String(done))) }
        if let isGroup = query.isGroup { items.append(URLQueryItem(name: "isGroup", value: String(isGroup))) }
        if let folder = query.folder, !folder.isEmpty, folder != "all" {
            items.append(URLQueryItem(name: "folder", value: folder))
        }
        if let before = query.before, !before.isEmpty {
            items.append(URLQueryItem(name: "before", value: before))
        }
        components.queryItems = items

        let (data, response) = try await authorizedRequest(
            url: components.url!,
            method: "GET",
            token: token
        )
        try throwIfUnauthorized(response)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let arr = json["messages"] as? [[String: Any]] else {
            throw ApiError.invalidResponse
        }
        return MessagesPage(
            messages: arr.map(MatchedMessage.init(json:)),
            hasMore: json["hasMore"] as? Bool ?? false,
            nextCursor: json["nextCursor"] as? String
        )
    }

    func fetchUnreadCounts(token: String) async throws -> [String: Int] {
        let url = URL(string: host() + "/messages/unread-counts")!
        let (data, response) = try await authorizedRequest(url: url, method: "GET", token: token)
        try throwIfUnauthorized(response)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let counts = json["counts"] as? [String: Any] else {
            throw ApiError.invalidResponse
        }
        let keys = ["all", "lgw", "lhr", "ltn", "stn", "others"]
        return Dictionary(uniqueKeysWithValues: keys.map { ($0, counts[$0] as? Int ?? 0) })
    }

    func patchMessage(
        token: String,
        id: String,
        read: Bool? = nil,
        starred: Bool? = nil,
        done: Bool? = nil
    ) async throws -> MatchedMessage {
        var body: [String: Any] = [:]
        if let read { body["read"] = read }
        if let starred { body["starred"] = starred }
        if let done { body["done"] = done }
        let url = URL(string: host() + "/messages/\(id)")!
        let (data, response) = try await authorizedRequest(
            url: url,
            method: "PATCH",
            token: token,
            jsonBody: body
        )
        try throwIfUnauthorized(response)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = json["message"] as? [String: Any] else {
            throw ApiError.invalidResponse
        }
        return MatchedMessage(json: message)
    }

    func registerDevice(token: String, fcmToken: String) async throws {
        let url = URL(string: host() + "/devices/register")!
        let body: [String: Any] = [
            "fcmToken": fcmToken,
            "platform": "ios",
        ]
        let (_, response) = try await authorizedRequest(
            url: url,
            method: "POST",
            token: token,
            jsonBody: body
        )
        try throwIfUnauthorized(response)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw ApiError.http(code, nil)
        }
    }

    private func auth(path: String, username: String, password: String) async throws -> AuthResult {
        let url = URL(string: host() + path)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "username": username,
            "password": password,
        ])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ApiError.invalidResponse }
        if !(200...299).contains(http.statusCode) {
            let err = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw ApiError.http(http.statusCode, err)
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["token"] as? String,
              let user = json["user"] as? [String: Any],
              let name = user["username"] as? String else {
            throw ApiError.invalidResponse
        }
        return AuthResult(token: token, username: name)
    }

    private func authorizedRequest(
        url: URL,
        method: String,
        token: String,
        jsonBody: [String: Any]? = nil
    ) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let jsonBody {
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
        }
        return try await session.data(for: request)
    }

    private func throwIfUnauthorized(_ response: URLResponse) throws {
        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            throw ApiError.unauthorized
        }
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw ApiError.http(http.statusCode, nil)
        }
    }

    private func host() -> String {
        UserPreferences.hostURL()
    }
}
