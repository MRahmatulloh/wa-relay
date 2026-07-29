package com.warelay.app.data.model

data class MatchedMessage(
    val id: String,
    val messageId: String,
    val text: String,
    val senderPhone: String?,
    val senderName: String?,
    val chatId: String,
    val isGroup: Boolean,
    val waLink: String?,
    val matchedPattern: String?,
    val timestamp: String?,
)
