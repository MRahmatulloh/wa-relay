package com.warelay.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.warelay.app.data.AppContainer
import com.warelay.app.data.model.MatchedMessage
import com.warelay.app.data.remote.ApiClient
import com.warelay.app.data.remote.ApiException
import com.warelay.app.data.remote.UnauthorizedException
import com.warelay.app.fcm.FcmHelper
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class InboxFilter {
    ALL,
    UNREAD,
    STARRED,
    DONE,
    GROUPS,
}

enum class InboxFolder(val apiValue: String) {
    ALL("all"),
    LGW("lgw"),
    LHR("lhr"),
    LTN("ltn"),
    STN("stn"),
    OTHERS("others"),
}

data class UiState(
    val hostUrl: String = "http://10.0.2.2:3000",
    val token: String? = null,
    val username: String? = null,
    val messages: List<MatchedMessage> = emptyList(),
    val folderUnread: Map<String, Int> = emptyMap(),
    val searchQuery: String = "",
    val filter: InboxFilter = InboxFilter.ALL,
    val folder: InboxFolder = InboxFolder.ALL,
    val expandedId: String? = null,
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    /** False until DataStore session is read once — avoids login flash on cold start. */
    val sessionReady: Boolean = false,
)

class RelayViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            container.preferences.hostUrl.collect { host ->
                _state.update { it.copy(hostUrl = host) }
            }
        }
        viewModelScope.launch {
            container.preferences.token.collect { token ->
                _state.update { it.copy(token = token, sessionReady = true) }
                if (token != null) {
                    connectAndLoad(token)
                } else {
                    container.socketManager.disconnect()
                    _state.update {
                        it.copy(
                            messages = emptyList(),
                            folderUnread = emptyMap(),
                            username = null,
                            expandedId = null,
                            hasMore = false,
                            loadingMore = false,
                        )
                    }
                }
            }
        }
        viewModelScope.launch {
            container.preferences.username.collect { name ->
                _state.update { it.copy(username = name) }
            }
        }
        viewModelScope.launch {
            container.socketManager.events.collect { msg ->
                _state.update { st ->
                    val existed = st.messages.any { it.messageId == msg.messageId }
                    val counts = if (!existed && msg.isUnread) {
                        bumpUnread(st.folderUnread, msg.folder, +1)
                    } else {
                        st.folderUnread
                    }
                    if (!matchesCurrentFilter(msg, st.folder, st.filter, st.searchQuery)) {
                        val without = st.messages.filterNot { it.messageId == msg.messageId }
                        return@update st.copy(messages = without, folderUnread = counts)
                    }
                    val without = st.messages.filterNot { it.messageId == msg.messageId }
                    st.copy(messages = listOf(msg) + without, folderUnread = counts)
                }
            }
        }
    }

    fun saveHost(url: String) {
        viewModelScope.launch {
            container.preferences.setHostUrl(url)
            _state.update { it.copy(info = "Host saved", error = null) }
            val token = container.preferences.getToken()
            if (token != null) {
                container.socketManager.disconnect()
                connectAndLoad(token)
            }
        }
    }

    fun login(username: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, info = null) }
            try {
                val result = container.api.login(username, password)
                container.preferences.setSession(result.token, result.username)
                registerFcm(result.token)
                _state.update { it.copy(loading = false, info = "Logged in") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Login failed") }
            }
        }
    }

    fun register(username: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, info = null) }
            try {
                val result = container.api.register(username, password)
                container.preferences.setSession(result.token, result.username)
                registerFcm(result.token)
                _state.update { it.copy(loading = false, info = "Registered") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Register failed") }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            container.socketManager.disconnect()
            container.preferences.clearSession()
            _state.update {
                it.copy(
                    messages = emptyList(),
                    folderUnread = emptyMap(),
                    hasMore = false,
                    loadingMore = false,
                    info = "Logged out",
                    error = null,
                    expandedId = null,
                )
            }
        }
    }

    fun refresh() {
        val token = _state.value.token ?: return
        viewModelScope.launch { loadMessages(token, reset = true) }
    }

    fun loadMore() {
        val st = _state.value
        val token = st.token ?: return
        if (!st.hasMore || st.loading || st.loadingMore || st.messages.isEmpty()) return
        viewModelScope.launch { loadMessages(token, reset = false) }
    }

    fun setSearchQuery(query: String) {
        _state.update { it.copy(searchQuery = query) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(280)
            val token = _state.value.token ?: return@launch
            loadMessages(token, reset = true)
        }
    }

    fun setFilter(filter: InboxFilter) {
        if (_state.value.filter == filter) return
        _state.update { it.copy(filter = filter) }
        val token = _state.value.token ?: return
        viewModelScope.launch { loadMessages(token, reset = true) }
    }

    fun setFolder(folder: InboxFolder) {
        if (_state.value.folder == folder) return
        _state.update { it.copy(folder = folder, expandedId = null) }
        val token = _state.value.token ?: return
        viewModelScope.launch { loadMessages(token, reset = true) }
    }

    fun toggleExpanded(msg: MatchedMessage) {
        val id = msg.id.ifBlank { msg.messageId }
        val currentlyExpanded = _state.value.expandedId == id
        _state.update {
            it.copy(expandedId = if (currentlyExpanded) null else id)
        }
        if (!currentlyExpanded && msg.isUnread) {
            markRead(msg, read = true)
        }
    }

    fun toggleStar(msg: MatchedMessage) {
        patch(msg, starred = !msg.starred)
    }

    fun toggleDone(msg: MatchedMessage) {
        patch(msg, done = !msg.done)
    }

    fun markRead(msg: MatchedMessage, read: Boolean) {
        patch(msg, read = read)
    }

    fun clearMessages() {
        _state.update { it.copy(error = null, info = null) }
    }

    private fun patch(
        msg: MatchedMessage,
        read: Boolean? = null,
        starred: Boolean? = null,
        done: Boolean? = null,
    ) {
        val token = _state.value.token ?: return
        if (msg.id.isBlank()) return
        // Optimistic local update
        val wasUnread = msg.isUnread
        _state.update { st ->
            st.copy(
                messages = st.messages.map { m ->
                    if (m.id != msg.id && m.messageId != msg.messageId) m
                    else m.copy(
                        starred = starred ?: m.starred,
                        done = done ?: m.done,
                        readAt = when (read) {
                            true -> m.readAt ?: java.time.Instant.now().toString()
                            false -> null
                            null -> m.readAt
                        },
                    )
                }.let { list ->
                    list.filter { matchesCurrentFilter(it, st.folder, st.filter, st.searchQuery) }
                },
                folderUnread = when {
                    read == true && wasUnread -> bumpUnread(st.folderUnread, msg.folder, -1)
                    read == false && !wasUnread -> bumpUnread(st.folderUnread, msg.folder, +1)
                    else -> st.folderUnread
                },
            )
        }
        viewModelScope.launch {
            try {
                val updated = container.api.patchMessage(
                    token = token,
                    id = msg.id,
                    read = read,
                    starred = starred,
                    done = done,
                )
                _state.update { st ->
                    val merged = st.messages
                        .filterNot { it.id == updated.id || it.messageId == updated.messageId }
                        .let { rest ->
                            if (matchesCurrentFilter(updated, st.folder, st.filter, st.searchQuery)) {
                                listOf(updated) + rest
                            } else {
                                rest
                            }
                        }
                        .sortedByDescending { it.createdAt ?: it.timestamp ?: "" }
                    st.copy(messages = merged)
                }
            } catch (_: UnauthorizedException) {
                container.preferences.clearSession()
                _state.update { it.copy(error = "Session expired") }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "Update failed") }
                refresh()
            }
        }
    }

    private suspend fun connectAndLoad(token: String) {
        container.socketManager.connect(token)
        loadMessages(token, reset = true)
        registerFcm(token)
    }

    private suspend fun loadMessages(token: String, reset: Boolean) {
        val st = _state.value
        if (reset) {
            _state.update { it.copy(loading = true, loadingMore = false, error = null) }
        } else {
            if (!st.hasMore || st.loadingMore) return
            _state.update { it.copy(loadingMore = true, error = null) }
        }

        try {
            val current = _state.value
            val before = if (reset) null else current.messages.lastOrNull()?.id?.takeIf { it.isNotBlank() }
            val page = container.api.fetchMessages(
                token,
                toQuery(current.folder, current.filter, current.searchQuery, before),
            )
            val counts = if (reset) {
                runCatching { container.api.fetchUnreadCounts(token) }.getOrDefault(current.folderUnread)
            } else {
                current.folderUnread
            }
            _state.update { prev ->
                val merged = if (reset) {
                    page.messages
                } else {
                    val seen = prev.messages.map { it.id.ifBlank { it.messageId } }.toHashSet()
                    prev.messages + page.messages.filter { msg ->
                        val key = msg.id.ifBlank { msg.messageId }
                        seen.add(key)
                    }
                }
                prev.copy(
                    loading = false,
                    loadingMore = false,
                    messages = merged,
                    folderUnread = counts,
                    hasMore = page.hasMore,
                )
            }
        } catch (_: UnauthorizedException) {
            container.preferences.clearSession()
            _state.update {
                it.copy(loading = false, loadingMore = false, error = "Session expired")
            }
        } catch (e: ApiException) {
            _state.update { it.copy(loading = false, loadingMore = false, error = e.message) }
        } catch (e: Exception) {
            _state.update {
                it.copy(loading = false, loadingMore = false, error = e.message ?: "Load failed")
            }
        }
    }

    private suspend fun registerFcm(token: String) {
        runCatching {
            val fcm = FcmHelper.getTokenOrFallback()
            container.api.registerDevice(token, fcm)
        }
    }

    companion object {
        fun bumpUnread(counts: Map<String, Int>, folder: String?, delta: Int): Map<String, Int> {
            if (delta == 0) return counts
            val key = folder?.lowercase()?.takeIf { it.isNotBlank() } ?: "others"
            val mutable = counts.toMutableMap()
            fun adj(k: String) {
                mutable[k] = (mutable[k] ?: 0).plus(delta).coerceAtLeast(0)
            }
            adj("all")
            adj(key)
            return mutable
        }

        fun toQuery(
            folder: InboxFolder,
            filter: InboxFilter,
            search: String,
            before: String? = null,
        ): ApiClient.MessageQuery {
            val q = search.trim().ifBlank { null }
            val folderParam = folder.apiValue.takeIf { it != "all" }
            val base = when (filter) {
                InboxFilter.ALL -> ApiClient.MessageQuery(q = q, folder = folderParam)
                InboxFilter.UNREAD -> ApiClient.MessageQuery(q = q, unread = true, folder = folderParam)
                InboxFilter.STARRED -> ApiClient.MessageQuery(q = q, starred = true, folder = folderParam)
                InboxFilter.DONE -> ApiClient.MessageQuery(q = q, done = true, folder = folderParam)
                InboxFilter.GROUPS -> ApiClient.MessageQuery(q = q, isGroup = true, folder = folderParam)
            }
            return base.copy(before = before)
        }

        fun matchesCurrentFilter(
            msg: MatchedMessage,
            folder: InboxFolder,
            filter: InboxFilter,
            search: String,
        ): Boolean {
            if (folder != InboxFolder.ALL) {
                val msgFolder = msg.folder?.lowercase().orEmpty()
                if (msgFolder != folder.apiValue) return false
            }
            val q = search.trim()
            if (q.isNotEmpty()) {
                val hay = listOfNotNull(
                    msg.text,
                    msg.senderName,
                    msg.senderPhone,
                    msg.matchedPattern,
                ).joinToString(" ").lowercase()
                if (!hay.contains(q.lowercase())) return false
            }
            return when (filter) {
                InboxFilter.ALL -> true
                InboxFilter.UNREAD -> msg.isUnread
                InboxFilter.STARRED -> msg.starred
                InboxFilter.DONE -> msg.done
                InboxFilter.GROUPS -> msg.isGroup
            }
        }
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return RelayViewModel(container) as T
        }
    }
}
