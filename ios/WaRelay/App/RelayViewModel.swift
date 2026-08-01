import Foundation
import SwiftUI
import UIKit

enum InboxFilter: String, CaseIterable, Identifiable {
    case all, unread, starred, thumbsUp, done, groups
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .unread: return "Unread"
        case .starred: return "Starred"
        case .thumbsUp: return "Thumbs up"
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

struct WhatsAppSessionStatus: Equatable {
    var loading = false
    var reachable = false
    var status: String?
    var ok = false
    var hasQr = false
    var error: String?
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
    @Published var whatsappSession = WhatsAppSessionStatus()

    private let api = ApiClient()
    private let socket = SocketManagerService()
    private let poller = RealtimePoller()
    private var searchTask: Task<Void, Never>?
    private var healthPollTask: Task<Void, Never>?
    /// Bumped on every full reload so stale folder/filter responses are dropped.
    private var loadGeneration = 0
    private var inboxTask: Task<Void, Never>?

    enum AppRoute: Hashable {
        case settings
    }

    init() {
        socket.onMessage = { [weak self] msg in
            Task { @MainActor in
                self?.handleSocketMessage(msg)
            }
        }
        socket.onConnectionChange = { [weak self] connected in
            Task { @MainActor in
                self?.handleSocketConnection(connected)
            }
        }
        poller.onTick = { [weak self] in
            guard let self, let token = self.token, !self.loading, !self.loadingMore else { return }
            // Only used while Socket.IO is down.
            await self.pollInbox(token: token)
        }
        PushManager.shared.onToken = { [weak self] pushToken in
            Task { @MainActor in
                guard let self, let token = self.token else { return }
                await self.registerDevice(token: token, fcmToken: pushToken)
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
        Task { await loadWhatsAppSession(showLoading: true) }
        if let token {
            socket.disconnect()
            poller.stop()
            Task { await connectAndLoad(token: token) }
        }
    }

    func startWhatsAppSessionPolling() {
        guard healthPollTask == nil else { return }
        healthPollTask = Task {
            while !Task.isCancelled {
                await loadWhatsAppSession(showLoading: whatsappSession.status == nil)
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
    }

    func stopWhatsAppSessionPolling() {
        healthPollTask?.cancel()
        healthPollTask = nil
    }

    func refreshWhatsAppSession() {
        Task { await loadWhatsAppSession(showLoading: true) }
    }

    private func loadWhatsAppSession(showLoading: Bool) async {
        if showLoading {
            var next = whatsappSession
            next.loading = true
            next.error = nil
            whatsappSession = next
        }
        do {
            let health = try await api.fetchHealth()
            whatsappSession = WhatsAppSessionStatus(
                loading: false,
                reachable: health.ok,
                status: health.whatsappStatus,
                ok: health.whatsappOk,
                hasQr: health.hasQr
            )
        } catch {
            whatsappSession = WhatsAppSessionStatus(
                loading: false,
                reachable: false,
                error: Self.describeNetworkError(error, host: hostURL)
            )
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
                self.error = Self.describeNetworkError(error, host: hostURL)
            }
        }
    }

    /// Maps ATS / cleartext / localhost mistakes into actionable copy for real devices.
    static func describeNetworkError(_ error: Error, host: String) -> String {
        let ns = error as NSError
        let urlError = error as? URLError
        let code = urlError?.code ?? URLError.Code(rawValue: ns.code)
        if code == .appTransportSecurityRequiresSecureConnection
            || ns.localizedDescription.localizedCaseInsensitiveContains("App Transport Security") {
            return "iOS blocked plain HTTP to \(host). Rebuild/reinstall the latest IPA (ATS allowlist), then set this Host in Settings and Save."
        }
        if host.contains("127.0.0.1") || host.contains("localhost") {
            #if !targetEnvironment(simulator)
            return "This iPhone cannot reach \(host). Set Host in Settings to your PC LAN IP (e.g. http://192.168.x.x:4500)."
            #endif
        }
        return error.localizedDescription
    }

    func logout() {
        socket.disconnect()
        poller.stop()
        cancelInboxLoads()
        UserPreferences.clearSession()
        token = nil
        username = nil
        messages = []
        folderUnread = [:]
        searchQuery = ""
        filter = .all
        folder = .all
        hasMore = false
        loading = false
        loadingMore = false
        expandedId = nil
        info = "Logged out"
        error = nil
        path = []
    }

    func refresh() {
        requestMessages(reset: true)
    }

    func loadMore() {
        guard hasMore, !loading, !loadingMore, !messages.isEmpty else { return }
        requestMessages(reset: false)
    }

    func setSearchQuery(_ query: String) {
        searchQuery = query
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 280_000_000)
            guard !Task.isCancelled else { return }
            requestMessages(reset: true)
        }
    }

    func setFilter(_ filter: InboxFilter) {
        guard self.filter != filter else { return }
        self.filter = filter
        requestMessages(reset: true)
    }

    func setFolder(_ folder: InboxFolder) {
        guard self.folder != folder else { return }
        self.folder = folder
        expandedId = nil
        requestMessages(reset: true)
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

    func toggleThumbsUp(_ msg: MatchedMessage) {
        patch(msg, thumbsUp: !msg.thumbsUp)
    }

    func toggleDone(_ msg: MatchedMessage) {
        patch(msg, done: !msg.done)
    }

    func markRead(_ msg: MatchedMessage, read: Bool) {
        patch(msg, read: read)
    }

    func markAllSeen() {
        guard let token else { return }
        let folderParam = folder.apiValue
        let now = ISO8601DateFormatter().string(from: Date())

        messages = messages.map { m in
            m.isUnread ? m.updating(readAt: now) : m
        }.filter { Self.matchesCurrentFilter($0, folder: folder, filter: filter, search: searchQuery) }

        if folder == .all {
            folderUnread = ["all": 0, "lgw": 0, "lhr": 0, "ltn": 0, "stn": 0, "others": 0]
        } else {
            let cleared = folderUnread[folderParam] ?? 0
            var next = folderUnread
            next[folderParam] = 0
            next["all"] = max(0, (next["all"] ?? 0) - cleared)
            folderUnread = next
        }
        error = nil

        Task {
            do {
                let counts = try await api.markAllRead(
                    token: token,
                    folder: folder == .all ? "all" : folderParam
                )
                folderUnread = counts
                if filter == .unread {
                    requestMessages(reset: true)
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

    func clearFlash() {
        error = nil
        info = nil
    }

    func openWhatsApp(_ link: String?, text: String? = nil) {
        guard let url = Self.buildWaMeURL(link: link, text: text) else { return }
        UIApplication.shared.open(url)
    }

    /// Prefills WhatsApp compose with order text (`?text=`). No intro.
    private static func buildWaMeURL(link: String?, text: String?) -> URL? {
        guard var raw = link?.trimmingCharacters(in: .whitespacesAndNewlines),
              raw.hasPrefix("https://wa.me/"),
              raw.count > "https://wa.me/".count
        else { return nil }
        if let q = raw.firstIndex(of: "?") {
            raw = String(raw[..<q])
        }
        guard var components = URLComponents(string: raw) else { return nil }
        let body = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !body.isEmpty {
            let truncated = body.count > 1500 ? String(body.prefix(1500)) : body
            components.queryItems = [URLQueryItem(name: "text", value: truncated)]
        }
        return components.url
    }

    func testLocalNotification() {
        PushManager.shared.scheduleLocalTestNotification()
        info = "Local notification in 5s"
    }

    private func connectAndLoad(token: String) async {
        socket.connect(token: token)
        await loadMessages(token: token, reset: true, generation: beginFullReload())
        await registerFcm(token: token)
        // Poller starts only if the socket is still down after the initial connect attempt.
        if !socket.isConnected {
            poller.start()
        }
    }

    private func handleSocketConnection(_ connected: Bool) {
        guard token != nil else {
            poller.stop()
            return
        }
        if connected {
            poller.stop()
        } else {
            poller.start()
        }
    }

    private func handleSocketMessage(_ msg: MatchedMessage) {
        let existed = messages.contains { $0.messageId == msg.messageId || $0.rowId == msg.rowId }
        if !existed && msg.isUnread {
            folderUnread = Self.bumpUnread(folderUnread, folder: msg.folder, delta: 1)
        }
        messages.removeAll { $0.messageId == msg.messageId || $0.rowId == msg.rowId }
        if Self.matchesCurrentFilter(msg, folder: folder, filter: filter, search: searchQuery) {
            messages.insert(msg, at: 0)
        }
    }

    private func cancelInboxLoads() {
        loadGeneration += 1
        inboxTask?.cancel()
        inboxTask = nil
        searchTask?.cancel()
        searchTask = nil
    }

    /// Starts a cancelable inbox fetch. Full reloads bump generation so older responses are ignored.
    private func requestMessages(reset: Bool) {
        guard let token else { return }
        if reset {
            let generation = beginFullReload()
            inboxTask = Task {
                await loadMessages(token: token, reset: true, generation: generation)
            }
            return
        }
        guard !loading, !loadingMore, hasMore else { return }
        let generation = loadGeneration
        loadingMore = true
        Task {
            await loadMessages(token: token, reset: false, generation: generation)
        }
    }

    @discardableResult
    private func beginFullReload() -> Int {
        loadGeneration += 1
        inboxTask?.cancel()
        inboxTask = nil
        loadingMore = false
        return loadGeneration
    }

    /// Quiet tick: merge only brand-new page-1 rows + refresh unread badges (keeps pagination).
    private func pollInbox(token: String) async {
        let generation = loadGeneration
        let folderAtStart = folder
        let filterAtStart = filter
        let searchAtStart = searchQuery
        do {
            let page = try await api.fetchMessages(
                token: token,
                query: Self.toQuery(folder: folderAtStart, filter: filterAtStart, search: searchAtStart)
            )
            let counts = try? await api.fetchUnreadCounts(token: token)
            guard !Task.isCancelled,
                  generation == loadGeneration,
                  folder == folderAtStart,
                  filter == filterAtStart,
                  searchQuery == searchAtStart
            else { return }

            var seen = Set(messages.map(\.rowId))
            let fresh = page.messages.filter { seen.insert($0.rowId).inserted }
            if !fresh.isEmpty {
                messages = Self.sortByNewest(fresh + messages)
            }
            if let counts {
                folderUnread = counts
            }
        } catch ApiError.unauthorized {
            guard generation == loadGeneration else { return }
            socket.disconnect()
            poller.stop()
            UserPreferences.clearSession()
            self.token = nil
            error = "Session expired"
        } catch {
            // Silent — next tick retries.
        }
    }

    private func loadMessages(token: String, reset: Bool, generation: Int) async {
        if reset {
            loading = true
            error = nil
            loadingMore = false
        } else {
            error = nil
        }

        let folderAtStart = folder
        let filterAtStart = filter
        let searchAtStart = searchQuery
        let before = reset ? nil : messages.last?.id.nilIfEmpty

        do {
            let page = try await api.fetchMessages(
                token: token,
                query: Self.toQuery(
                    folder: folderAtStart,
                    filter: filterAtStart,
                    search: searchAtStart,
                    before: before
                )
            )
            let counts: [String: Int]
            if reset {
                counts = (try? await api.fetchUnreadCounts(token: token)) ?? folderUnread
            } else {
                counts = folderUnread
            }
            guard generation == loadGeneration,
                  folder == folderAtStart,
                  filter == filterAtStart,
                  searchQuery == searchAtStart
            else { return }

            if reset {
                messages = page.messages
                hasMore = page.hasMore
                folderUnread = counts
            } else {
                var seen = Set(messages.map(\.rowId))
                let extras = page.messages.filter { seen.insert($0.rowId).inserted }
                messages.append(contentsOf: extras)
                hasMore = page.hasMore
            }
            loading = false
            loadingMore = false
        } catch ApiError.unauthorized {
            guard generation == loadGeneration else { return }
            socket.disconnect()
            poller.stop()
            UserPreferences.clearSession()
            self.token = nil
            loading = false
            loadingMore = false
            error = "Session expired"
        } catch {
            guard generation == loadGeneration else { return }
            loading = false
            loadingMore = false
            if Self.isCancellation(error) { return }
            self.error = error.localizedDescription
        }
    }

    private static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        return Task.isCancelled
    }

    private static func sortByNewest(_ list: [MatchedMessage]) -> [MatchedMessage] {
        list.sorted {
            ($0.createdAt ?? $0.timestamp ?? "") > ($1.createdAt ?? $1.timestamp ?? "")
        }
    }

    private func patch(
        _ msg: MatchedMessage,
        read: Bool? = nil,
        starred: Bool? = nil,
        done: Bool? = nil,
        thumbsUp: Bool? = nil
    ) {
        guard let token, !msg.id.isEmpty else { return }
        let wasUnread = msg.isUnread

        messages = messages.map { m in
            guard m.id == msg.id || m.messageId == msg.messageId else { return m }
            var next = m
            if let starred { next = next.updating(starred: starred) }
            if let done { next = next.updating(done: done) }
            if let thumbsUp { next = next.updating(thumbsUp: thumbsUp) }
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
                    done: done,
                    thumbsUp: thumbsUp
                )
                var rest = messages.filter { $0.id != updated.id && $0.messageId != updated.messageId }
                if Self.matchesCurrentFilter(updated, folder: folder, filter: filter, search: searchQuery) {
                    rest.insert(updated, at: 0)
                }
                messages = Self.sortByNewest(rest)
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

    private func registerFcm(token: String) async {
        PushManager.shared.requestPermissionAndRegister()
        if let push = PushManager.shared.currentTokenOrFallback() {
            await registerDevice(token: token, fcmToken: push)
        }
    }

    private func registerDevice(token: String, fcmToken: String) async {
        guard !fcmToken.hasPrefix("local-") else { return }
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
        case .thumbsUp: base.thumbsUp = true
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
            let raw = (msg.folder ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let msgFolder = raw.isEmpty ? "others" : raw
            if msgFolder != folder.apiValue { return false }
        }
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines)
        if !q.isEmpty {
            let hay = [msg.text, msg.senderName, msg.senderPhone, msg.groupName, msg.matchedPattern]
                .compactMap { $0 }
                .joined(separator: " ")
                .lowercased()
            if !hay.contains(q.lowercased()) { return false }
        }
        switch filter {
        case .all: return true
        case .unread: return msg.isUnread
        case .starred: return msg.starred
        case .thumbsUp: return msg.thumbsUp
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
