import Foundation
import UIKit
import UserNotifications
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

@MainActor
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    private(set) var fcmToken: String?
    var onToken: ((String) -> Void)?

    private override init() {
        super.init()
    }

    func configureFirebaseIfNeeded() {
        #if canImport(FirebaseCore)
        guard FirebaseApp.app() == nil else { return }
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            print("Firebase skipped: GoogleService-Info.plist missing")
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
        Messaging.messaging().apnsToken = deviceToken
        #endif
        refreshToken()
    }

    func refreshToken() {
        #if canImport(FirebaseMessaging)
        guard FirebaseApp.app() != nil else {
            emitLocalFallback()
            return
        }
        Messaging.messaging().token { [weak self] token, error in
            Task { @MainActor in
                if let token, error == nil {
                    self?.fcmToken = token
                    self?.onToken?(token)
                } else {
                    self?.emitLocalFallback()
                }
            }
        }
        #else
        emitLocalFallback()
        #endif
    }

    func currentTokenOrFallback() -> String {
        if let fcmToken, !fcmToken.isEmpty { return fcmToken }
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
        fcmToken = token
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

#if canImport(FirebaseMessaging)
extension PushManager: MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Task { @MainActor in
            guard let fcmToken else { return }
            self.fcmToken = fcmToken
            self.onToken?(fcmToken)
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
