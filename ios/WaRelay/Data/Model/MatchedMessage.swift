import Foundation

struct MatchedMessage: Identifiable, Equatable, Sendable {
    let id: String
    let messageId: String
    let text: String
    let senderPhone: String?
    let senderName: String?
    let groupName: String?
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
    let thumbsUp: Bool

    var isUnread: Bool { readAt?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true }

    var rowId: String { id.isEmpty ? messageId : id }

    var displaySender: String {
        let sender = senderName ?? senderPhone ?? "Unknown"
        if isGroup, let group = groupName?.trimmingCharacters(in: .whitespacesAndNewlines), !group.isEmpty {
            return "\(sender) · \(group)"
        }
        return sender
    }

    init(
        id: String,
        messageId: String,
        text: String,
        senderPhone: String?,
        senderName: String?,
        groupName: String?,
        chatId: String,
        isGroup: Bool,
        waLink: String?,
        matchedPattern: String?,
        folder: String?,
        timestamp: String?,
        createdAt: String?,
        readAt: String?,
        starred: Bool,
        done: Bool,
        thumbsUp: Bool
    ) {
        self.id = id
        self.messageId = messageId
        self.text = text
        self.senderPhone = senderPhone
        self.senderName = senderName
        self.groupName = groupName
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
        self.thumbsUp = thumbsUp
    }

    init(json: [String: Any]) {
        id = Self.string(json["id"]) ?? ""
        messageId = Self.string(json["messageId"]) ?? ""
        text = Self.string(json["text"]) ?? ""
        senderPhone = Self.nullableString(json["senderPhone"])
        senderName = Self.nullableString(json["senderName"])
        groupName = Self.nullableString(json["groupName"])
        chatId = Self.string(json["chatId"]) ?? ""
        isGroup = Self.bool(json["isGroup"])
        waLink = Self.nullableString(json["waLink"])
        matchedPattern = Self.nullableString(json["matchedPattern"])
        folder = Self.nullableString(json["folder"])
        timestamp = Self.nullableString(json["timestamp"])
        createdAt = Self.nullableString(json["createdAt"])
        readAt = Self.nullableString(json["readAt"])
        starred = Self.bool(json["starred"])
        done = Self.bool(json["done"])
        thumbsUp = Self.bool(json["thumbsUp"])
    }

    func updating(
        readAt: String? = nil,
        clearReadAt: Bool = false,
        starred: Bool? = nil,
        done: Bool? = nil,
        thumbsUp: Bool? = nil
    ) -> MatchedMessage {
        MatchedMessage(
            id: id,
            messageId: messageId,
            text: text,
            senderPhone: senderPhone,
            senderName: senderName,
            groupName: groupName,
            chatId: chatId,
            isGroup: isGroup,
            waLink: waLink,
            matchedPattern: matchedPattern,
            folder: folder,
            timestamp: timestamp,
            createdAt: createdAt,
            readAt: clearReadAt ? nil : (readAt ?? self.readAt),
            starred: starred ?? self.starred,
            done: done ?? self.done,
            thumbsUp: thumbsUp ?? self.thumbsUp
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

    private static func bool(_ value: Any?) -> Bool {
        if let b = value as? Bool { return b }
        if let n = value as? NSNumber { return n.boolValue }
        if let s = string(value)?.lowercased() {
            return s == "true" || s == "1" || s == "yes"
        }
        return false
    }
}
