import Foundation
import SwiftUI
import UIKit

enum InboxFilter: String, CaseIterable, Identifiable {
    case all, unread, starred, done, groups
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .unread: return "Unread"
        case .starred: return "Starred"
        case .done: return "Done"
        case .groups: return "Groups"
        }
    }
}

enum InboxFolder: String, CaseIterable, Identifiable {
    case all, lgw, lhr, ltn, stn, others
    var id: String { rawValue }
    var apiValue: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .lgw: return "LGW"
        case .lhr: return "LHR"
        case .ltn: return "LTN"
        case .stn: return "STN"
        case .others: return "Others"
        }
    }
}

@MainActor
final class RelayViewModel: ObservableObject {
    @Published var hostURL: String = UserPreferences.defaultHostURL
    @Published var token: String?
    @Published var username: String?
    @Published var messages: [MatchedMessage] = []
    @Published var folderUnread: [String: Int] = [:]
    @Published var searchQuery: String = ""
    @Published var filter: InboxFilter = .all
    @Published var folder: InboxFolder = .all
    @Published var expandedId: String?
    @Published var loading = false
    @Published var loadingMore = false
    @Published var hasMore = false
    @Published var error: String?
    @Published var info: String?
    @Published var sessionReady = false
    @Published var path: [AppRoute] = []

    private let api = ApiClient()
    private let socket = SocketManagerService()
    private var searchTask: Task<Void, Never>?

    enum AppRoute: Hashable {
        case settings
    }

    init() {
        socket.onMessage = { [weak self] msg in
            self?.handleSocketMessage(msg)
        }
        PushManager.shared.onToken = { [weak self] fcm in
            Task { @MainActor in
                guard let self, let token = self.token else { return }
                await self.registerDevice(token: token, fcmToken: fcm)
            }
        }
        Task { await bootstrap() }
    }

    func bootstrap() async {
        hostURL = UserPreferences.hostURL()
        username = UserPreferences.username()
        token = UserPreferences.token()
        sessionReady = true
        if let token {
            await connectAndLoad(token: token)
        }
    }

    func saveHost(_ url: String) {
        UserPreferences.setHostURL(url)
        hostURL = UserPreferences.hostURL()
        info = "Host saved"
        error = nil
        if let token {
            socket.disconnect()
            Task { await connectAndLoad(token: token) }
        }
    }

    func login(username: String, password: String) {
        Task {
            loading = true
            error = nil
            info = nil
            do {
                let result = try await api.login(username: username, password: password)
                UserPreferences.setSession(token: result.token, username: result.username)
                self.token = result.token
                self.username = result.username
                await registerFcm(token: result.token)
                await connectAndLoad(token: result.token)
                loading = false
                info = "Logged in"
            } catch {
                loading = false
                self.error = error.localizedDescription
            }
        }
    }

    func logout() {
        socket.disconnect()
        UserPreferences.clearSession()
        token = nil
        username = nil
        messages = []
        folderUnread = [:]
        hasMore = false
        loadingMore = false
        expandedId = nil
        info = "Logged out"
        error = nil
        path = []
    }

    func refresh() {
        guard let token else { return }
        Task { await loadMessages(token: token, reset: true) }
    }

    func loadMore() {
        guard let token, hasMore, !loading, !loadingMore, !messages.isEmpty else { return }
        Task { await loadMessages(token: token, reset: false) }
    }

    func setSearchQuery(_ query: String) {
        searchQuery = query
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 280_000_000)
            guard !Task.isCancelled, let token else { return }
            await loadMessages(token: token, reset: true)
        }
    }

    func setFilter(_ filter: InboxFilter) {
        guard self.filter != filter else { return }
        self.filter = filter
        guard let token else { return }
        Task { await loadMessages(token: token, reset: true) }
    }

    func setFolder(_ folder: InboxFolder) {
        guard self.folder != folder else { return }
        self.folder = folder
        expandedId = nil
        guard let token else { return }
        Task { await loadMessages(token: token, reset: true) }
    }

    func toggleExpanded(_ msg: MatchedMessage) {
        let id = msg.rowId
        let currentlyExpanded = expandedId == id
        expandedId = currentlyExpanded ? nil : id
        if !currentlyExpanded && msg.isUnread {
            markRead(msg, read: true)
        }
    }

    func toggleStar(_ msg: MatchedMessage) {
        patch(msg, starred: !msg.starred)
    }

    func toggleDone(_ msg: MatchedMessage) {
        patch(msg, done: !msg.done)
    }

    func markRead(_ msg: MatchedMessage, read: Bool) {
        patch(msg, read: read)
    }

    func clearFlash() {
        error = nil
        info = nil
    }

    func openWhatsApp(_ link: String?) {
        guard let link, let url = URL(string: link) else { return }
        UIApplication.shared.open(url)
    }

    func testLocalNotification() {
        PushManager.shared.scheduleLocalTestNotification()
        info = "Local notification in 5s"
    }

    private func connectAndLoad(token: String) async {
        socket.connect(token: token)
        await loadMessages(token: token, reset: true)
        await registerFcm(token: token)
    }

    private func loadMessages(token: String, reset: Bool) async {
        if reset {
            loading = true
            loadingMore = false
            error = nil
        } else {
            guard hasMore, !loadingMore else { return }
            loadingMore = true
            error = nil
        }

        do {
            let before = reset ? nil : messages.last?.id.nilIfEmpty
            let page = try await api.fetchMessages(
                token: token,
                query: Self.toQuery(folder: folder, filter: filter, search: searchQuery, before: before)
            )
            let counts: [String: Int]
            if reset {
                counts = (try? await api.fetchUnreadCounts(token: token)) ?? folderUnread
            } else {
                counts = folderUnread
            }
            if reset {
                messages = page.messages
            } else {
                var seen = Set(messages.map(\.rowId))
                let extras = page.messages.filter { seen.insert($0.rowId).inserted }
                messages.append(contentsOf: extras)
            }
            folderUnread = counts
            hasMore = page.hasMore
            loading = false
            loadingMore = false
        } catch ApiError.unauthorized {
            UserPreferences.clearSession()
            self.token = nil
            loading = false
            loadingMore = false
            error = "Session expired"
        } catch {
            loading = false
            loadingMore = false
            self.error = error.localizedDescription
        }
    }

    private func patch(
        _ msg: MatchedMessage,
        read: Bool? = nil,
        starred: Bool? = nil,
        done: Bool? = nil
    ) {
        guard let token, !msg.id.isEmpty else { return }
        let wasUnread = msg.isUnread

        messages = messages.map { m in
            guard m.id == msg.id || m.messageId == msg.messageId else { return m }
            var next = m
            if let starred { next = next.updating(starred: starred) }
            if let done { next = next.updating(done: done) }
            if let read {
                next = read
                    ? next.updating(readAt: ISO8601DateFormatter().string(from: Date()))
                    : next.updating(clearReadAt: true)
            }
            return next
        }.filter { Self.matchesCurrentFilter($0, folder: folder, filter: filter, search: searchQuery) }

        if read == true && wasUnread {
            folderUnread = Self.bumpUnread(folderUnread, folder: msg.folder, delta: -1)
        } else if read == false && !wasUnread {
            folderUnread = Self.bumpUnread(folderUnread, folder: msg.folder, delta: 1)
        }

        Task {
            do {
                let updated = try await api.patchMessage(
                    token: token,
                    id: msg.id,
                    read: read,
                    starred: starred,
                    done: done
                )
                var rest = messages.filter { $0.id != updated.id && $0.messageId != updated.messageId }
                if Self.matchesCurrentFilter(updated, folder: folder, filter: filter, search: searchQuery) {
                    rest.insert(updated, at: 0)
                }
                messages = rest.sorted {
                    ($0.createdAt ?? $0.timestamp ?? "") > ($1.createdAt ?? $1.timestamp ?? "")
                }
            } catch ApiError.unauthorized {
                UserPreferences.clearSession()
                self.token = nil
                error = "Session expired"
            } catch {
                self.error = error.localizedDescription
                refresh()
            }
        }
    }

    private func handleSocketMessage(_ msg: MatchedMessage) {
        let existed = messages.contains { $0.messageId == msg.messageId }
        if !existed && msg.isUnread {
            folderUnread = Self.bumpUnread(folderUnread, folder: msg.folder, delta: 1)
        }
        messages.removeAll { $0.messageId == msg.messageId }
        if Self.matchesCurrentFilter(msg, folder: folder, filter: filter, search: searchQuery) {
            messages.insert(msg, at: 0)
        }
    }

    private func registerFcm(token: String) async {
        let fcm = PushManager.shared.currentTokenOrFallback()
        await registerDevice(token: token, fcmToken: fcm)
        PushManager.shared.requestPermissionAndRegister()
    }

    private func registerDevice(token: String, fcmToken: String) async {
        _ = try? await api.registerDevice(token: token, fcmToken: fcmToken)
    }

    static func bumpUnread(_ counts: [String: Int], folder: String?, delta: Int) -> [String: Int] {
        guard delta != 0 else { return counts }
        let key = (folder?.lowercased()).flatMap { $0.isEmpty ? nil : $0 } ?? "others"
        var mutable = counts
        func adj(_ k: String) {
            mutable[k] = max(0, (mutable[k] ?? 0) + delta)
        }
        adj("all")
        adj(key)
        return mutable
    }

    static func toQuery(
        folder: InboxFolder,
        filter: InboxFilter,
        search: String,
        before: String? = nil
    ) -> MessageQuery {
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let folderParam = folder == .all ? nil : folder.apiValue
        var base = MessageQuery(q: q, folder: folderParam, before: before)
        switch filter {
        case .all: break
        case .unread: base.unread = true
        case .starred: base.starred = true
        case .done: base.done = true
        case .groups: base.isGroup = true
        }
        return base
    }

    static func matchesCurrentFilter(
        _ msg: MatchedMessage,
        folder: InboxFolder,
        filter: InboxFilter,
        search: String
    ) -> Bool {
        if folder != .all {
            let msgFolder = (msg.folder ?? "").lowercased()
            if msgFolder != folder.apiValue { return false }
        }
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines)
        if !q.isEmpty {
            let hay = [msg.text, msg.senderName, msg.senderPhone, msg.matchedPattern]
                .compactMap { $0 }
                .joined(separator: " ")
                .lowercased()
            if !hay.contains(q.lowercased()) { return false }
        }
        switch filter {
        case .all: return true
        case .unread: return msg.isUnread
        case .starred: return msg.starred
        case .done: return msg.done
        case .groups: return msg.isGroup
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
