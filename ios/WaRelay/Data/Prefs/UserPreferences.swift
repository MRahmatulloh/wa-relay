import Foundation
import Security

enum UserPreferences {
    private static let hostKey = "host_url"
    private static let usernameKey = "username"
    private static let tokenService = "com.warelay.app.auth"
    private static let tokenAccount = "jwt"

    static let defaultHostURL = "http://127.0.0.1:3000"

    static func hostURL() -> String {
        let value = UserDefaults.standard.string(forKey: hostKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return (value?.isEmpty == false) ? value! : defaultHostURL
    }

    static func setHostURL(_ url: String) {
        let cleaned = url
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        UserDefaults.standard.set(cleaned, forKey: hostKey)
    }

    static func username() -> String? {
        UserDefaults.standard.string(forKey: usernameKey)
    }

    static func setUsername(_ name: String?) {
        if let name {
            UserDefaults.standard.set(name, forKey: usernameKey)
        } else {
            UserDefaults.standard.removeObject(forKey: usernameKey)
        }
    }

    static func token() -> String? {
        Keychain.read(service: tokenService, account: tokenAccount)
    }

    static func setSession(token: String, username: String) {
        _ = Keychain.write(service: tokenService, account: tokenAccount, value: token)
        setUsername(username)
    }

    static func clearSession() {
        Keychain.delete(service: tokenService, account: tokenAccount)
        setUsername(nil)
    }
}

enum Keychain {
    static func write(service: String, account: String, value: String) -> Bool {
        let data = Data(value.utf8)
        delete(service: service, account: account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func read(service: String, account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(service: String, account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
