import Foundation
import UIKit
import UserNotifications
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

/// Registers for remote notifications and exposes a push token for `/devices/register`.
/// Primary path: native APNs device token (hex) — works without Firebase.
/// Optional: FCM token when `GoogleService-Info.plist` is present.
@MainActor
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    private let apnsKey = "apns_device_token_hex"
    private(set) var pushToken: String?
    var onToken: ((String) -> Void)?

    private override init() {
        super.init()
    }

    func configureFirebaseIfNeeded() {
        #if canImport(FirebaseCore)
        guard FirebaseApp.app() == nil else { return }
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            return
        }
        FirebaseApp.configure()
        #if canImport(FirebaseMessaging)
        Messaging.messaging().delegate = self
        #endif
        #endif
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
        #if canImport(FirebaseMessaging)
        if FirebaseApp.app() != nil {
            Messaging.messaging().apnsToken = deviceToken
        }
        #endif
        let hex = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        UserDefaults.standard.set(hex, forKey: apnsKey)
        emit(hex)
    }

    func refreshToken() {
        if let hex = UserDefaults.standard.string(forKey: apnsKey), !hex.isEmpty {
            emit(hex)
            return
        }
        #if canImport(FirebaseMessaging)
        guard FirebaseApp.app() != nil else { return }
        Messaging.messaging().token { [weak self] token, error in
            Task { @MainActor in
                guard let token, error == nil else { return }
                self?.emit(token)
            }
        }
        #endif
    }

    /// Real APNs hex or FCM token. Nil until the system grants a device token (no `local-` stub).
    func currentTokenOrFallback() -> String? {
        if let pushToken, !pushToken.isEmpty, !pushToken.hasPrefix("local-") {
            return pushToken
        }
        if let hex = UserDefaults.standard.string(forKey: apnsKey), !hex.isEmpty {
            return hex
        }
        return nil
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

    private func emit(_ token: String) {
        pushToken = token
        onToken?(token)
    }
}

#if canImport(FirebaseMessaging)
extension PushManager: MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Task { @MainActor in
            // Prefer APNs hex for direct APNs backend; only use FCM if APNs not yet available.
            if let hex = UserDefaults.standard.string(forKey: self.apnsKey), !hex.isEmpty {
                self.emit(hex)
                return
            }
            guard let fcmToken else { return }
            self.emit(fcmToken)
        }
    }
}
#endif

extension PushManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
}
