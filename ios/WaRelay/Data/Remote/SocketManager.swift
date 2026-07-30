import Foundation

/// Lightweight realtime stand-in (no Socket.IO SPM — Starscream breaks Xcode 16 CI).
/// Polls the inbox while a session is active; swap back to socket.io later if needed.
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
