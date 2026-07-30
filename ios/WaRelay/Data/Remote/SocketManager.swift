import Foundation
import SocketIO

@MainActor
final class SocketManagerService {
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    var onMessage: ((MatchedMessage) -> Void)?

    func connect(token: String) {
        disconnect()
        let host = UserPreferences.hostURL()
        guard let url = URL(string: host) else { return }

        let config: SocketIOClientConfiguration = [
            .forceNew(true),
            .reconnects(true),
            .auth(["token": token]),
        ]
        let mgr = SocketManager(socketURL: url, config: config)
        let sock = mgr.defaultSocket

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
            DispatchQueue.main.async {
                self.onMessage?(MatchedMessage(json: dict))
            }
        }

        sock.connect()
        manager = mgr
        socket = sock
    }

    func disconnect() {
        socket?.removeAllHandlers()
        socket?.disconnect()
        socket = nil
        manager = nil
    }
}
