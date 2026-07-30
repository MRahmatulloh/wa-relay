import Foundation
import UIKit
import UserNotifications

/// Local notifications + device token registration.
/// Remote FCM/APNs via Firebase SPM is deferred (heavy CI fails on nanopb); backend skips `local-…` tokens.
@MainActor
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    private(set) var pushToken: String?
    var onToken: ((String) -> Void)?

    private override init() {
        super.init()
    }

    func configure() {
        // Placeholder for future Firebase wiring.
    }

    func requestPermissionAndRegister() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
        refreshToken()
    }

    func setAPNsToken(_ deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        // Not an FCM token — store for diagnostics; registration still uses local fallback until Firebase is added.
        UserDefaults.standard.set(hex, forKey: "apns_device_token_hex")
        refreshToken()
    }

    func refreshToken() {
        emitLocalFallback()
    }

    func currentTokenOrFallback() -> String {
        if let pushToken, !pushToken.isEmpty { return pushToken }
        return localFallbackToken()
    }

    func scheduleLocalTestNotification() {
        let content = UNMutableNotificationContent()
        content.title = "WA Relay"
        content.body = "Local notification test"
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        let req = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: trigger
        )
        UNUserNotificationCenter.current().add(req)
    }

    private func emitLocalFallback() {
        let token = localFallbackToken()
        pushToken = token
        onToken?(token)
    }

    private func localFallbackToken() -> String {
        let key = "local_fcm_fallback"
        if let existing = UserDefaults.standard.string(forKey: key) {
            return existing
        }
        let token = "local-\(UUID().uuidString)"
        UserDefaults.standard.set(token, forKey: key)
        return token
    }
}

extension PushManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
}
