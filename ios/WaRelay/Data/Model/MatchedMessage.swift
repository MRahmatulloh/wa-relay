import Foundation

struct MatchedMessage: Identifiable, Equatable, Sendable {
    let id: String
    let messageId: String
    let text: String
    let senderPhone: String?
    let senderName: String?
    let chatId: String
    let isGroup: Bool
    let waLink: String?
    let matchedPattern: String?
    let folder: String?
    let timestamp: String?
    let createdAt: String?
    let readAt: String?
    let starred: Bool
    let done: Bool

    var isUnread: Bool { readAt?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true }

    var rowId: String { id.isEmpty ? messageId : id }

    init(
        id: String,
        messageId: String,
        text: String,
        senderPhone: String?,
        senderName: String?,
        chatId: String,
        isGroup: Bool,
        waLink: String?,
        matchedPattern: String?,
        folder: String?,
        timestamp: String?,
        createdAt: String?,
        readAt: String?,
        starred: Bool,
        done: Bool
    ) {
        self.id = id
        self.messageId = messageId
        self.text = text
        self.senderPhone = senderPhone
        self.senderName = senderName
        self.chatId = chatId
        self.isGroup = isGroup
        self.waLink = waLink
        self.matchedPattern = matchedPattern
        self.folder = folder
        self.timestamp = timestamp
        self.createdAt = createdAt
        self.readAt = readAt
        self.starred = starred
        self.done = done
    }

    init(json: [String: Any]) {
        id = Self.string(json["id"]) ?? ""
        messageId = Self.string(json["messageId"]) ?? ""
        text = Self.string(json["text"]) ?? ""
        senderPhone = Self.nullableString(json["senderPhone"])
        senderName = Self.nullableString(json["senderName"])
        chatId = Self.string(json["chatId"]) ?? ""
        isGroup = json["isGroup"] as? Bool ?? false
        waLink = Self.nullableString(json["waLink"])
        matchedPattern = Self.nullableString(json["matchedPattern"])
        folder = Self.nullableString(json["folder"])
        timestamp = Self.nullableString(json["timestamp"])
        createdAt = Self.nullableString(json["createdAt"])
        readAt = Self.nullableString(json["readAt"])
        starred = json["starred"] as? Bool ?? false
        done = json["done"] as? Bool ?? false
    }

    func updating(readAt: String? = nil, clearReadAt: Bool = false, starred: Bool? = nil, done: Bool? = nil) -> MatchedMessage {
        MatchedMessage(
            id: id,
            messageId: messageId,
            text: text,
            senderPhone: senderPhone,
            senderName: senderName,
            chatId: chatId,
            isGroup: isGroup,
            waLink: waLink,
            matchedPattern: matchedPattern,
            folder: folder,
            timestamp: timestamp,
            createdAt: createdAt,
            readAt: clearReadAt ? nil : (readAt ?? self.readAt),
            starred: starred ?? self.starred,
            done: done ?? self.done
        )
    }

    private static func string(_ value: Any?) -> String? {
        guard let value else { return nil }
        if value is NSNull { return nil }
        let s = String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty || s == "null" || s == "undefined" { return nil }
        return s
    }

    private static func nullableString(_ value: Any?) -> String? {
        string(value)
    }
}
