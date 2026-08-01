import Foundation
import SocketIO

/// Socket.IO client for live `message:matched` events (same contract as Android).
final class SocketManagerService {
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    var onMessage: ((MatchedMessage) -> Void)?
    /// Fired on main queue when the default socket connects/disconnects.
    var onConnectionChange: ((Bool) -> Void)?

    private(set) var isConnected = false

    func connect(token: String) {
        disconnect()
        let host = UserPreferences.hostURL()
        guard let url = URL(string: host) else { return }

        // Backend accepts handshake.auth.token OR query.token.
        // Use connect(withPayload:) for auth; connectParams as query fallback.
        // (.auth is not available on all SocketIO SPM versions.)
        let config: SocketIOClientConfiguration = [
            .forceNew(true),
            .reconnects(true),
            .connectParams(["token": token]),
        ]
        let mgr = SocketManager(socketURL: url, config: config)
        let sock = mgr.defaultSocket

        sock.on(clientEvent: .connect) { [weak self] _, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isConnected = true
                self.onConnectionChange?(true)
            }
        }
        sock.on(clientEvent: .disconnect) { [weak self] _, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isConnected = false
                self.onConnectionChange?(false)
            }
        }
        sock.on(clientEvent: .reconnect) { [weak self] _, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isConnected = true
                self.onConnectionChange?(true)
            }
        }

        sock.on("message:matched") { [weak self] data, _ in
            guard let self else { return }
            let dict: [String: Any]?
            if let obj = data.first as? [String: Any] {
                dict = obj
            } else if let str = data.first as? String,
                      let d = str.data(using: .utf8),
                      let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                dict = obj
            } else if let ns = data.first as? NSDictionary {
                dict = ns as? [String: Any]
            } else {
                dict = nil
            }
            guard let dict else { return }
            let message = MatchedMessage(json: dict)
            DispatchQueue.main.async {
                self.onMessage?(message)
            }
        }

        sock.connect(withPayload: ["token": token])
        manager = mgr
        socket = sock
    }

    func disconnect() {
        socket?.removeAllHandlers()
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        // Do not emit onConnectionChange here — avoids briefly starting the poller
        // during an intentional reconnect. Live drops still fire via clientEvent.disconnect.
    }
}

/// Fallback when Socket.IO is disconnected: merge page-1 + refresh unread badges.
@MainActor
final class RealtimePoller {
    private var task: Task<Void, Never>?
    var onTick: (() async -> Void)?

    func start(intervalNanoseconds: UInt64 = 3_000_000_000) {
        stop()
        task = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: intervalNanoseconds)
                guard !Task.isCancelled else { break }
                await self?.onTick?()
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }
}
