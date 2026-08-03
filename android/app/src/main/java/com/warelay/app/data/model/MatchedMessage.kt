package com.warelay.app.data.model

data class TransferJob(
    val from: String? = null,
    val to: String? = null,
    val price: Double? = null,
    val currency: String? = "GBP",
)

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
    val jobs: List<TransferJob> = emptyList(),
    val parseStatus: String? = null,
    val parseSource: String? = null,
    val timestamp: String?,
    val createdAt: String? = null,
    val readAt: String? = null,
    val starred: Boolean = false,
    val done: Boolean = false,
    val thumbsUp: Boolean = false,
) {
    val isUnread: Boolean get() = readAt.isNullOrBlank()

    val jobsSummary: String?
        get() {
            val first = jobs.firstOrNull() ?: return null
            val route = listOfNotNull(first.from, first.to).joinToString(" → ")
            val price = first.price?.let { "£${if (it % 1.0 == 0.0) it.toInt() else it}" }
            val base = listOf(route, price).filter { !it.isNullOrBlank() }.joinToString(" · ")
            if (base.isBlank()) return null
            return if (jobs.size > 1) "$base (+${jobs.size - 1})" else base
        }
}
