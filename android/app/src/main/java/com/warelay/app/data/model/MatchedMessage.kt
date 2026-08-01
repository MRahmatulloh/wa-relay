package com.warelay.app.data.model

data class MatchedMessage(
    val id: String,
    val messageId: String,
    val text: String,
    val senderPhone: String?,
    val senderName: String?,
    val groupName: String? = null,
    val chatId: String,
    val isGroup: Boolean,
    val waLink: String?,
    val matchedPattern: String?,
    val folder: String? = null,
    val timestamp: String?,
    val createdAt: String? = null,
    val readAt: String? = null,
    val starred: Boolean = false,
    val done: Boolean = false,
    val thumbsUp: Boolean = false,
) {
    val isUnread: Boolean get() = readAt.isNullOrBlank()
}
