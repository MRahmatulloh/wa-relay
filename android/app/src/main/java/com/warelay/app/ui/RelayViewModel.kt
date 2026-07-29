package com.warelay.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.warelay.app.data.AppContainer
import com.warelay.app.data.model.MatchedMessage
import com.warelay.app.data.remote.ApiException
import com.warelay.app.data.remote.UnauthorizedException
import com.warelay.app.fcm.FcmHelper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class UiState(
    val hostUrl: String = "http://10.0.2.2:3000",
    val token: String? = null,
    val username: String? = null,
    val messages: List<MatchedMessage> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
)

class RelayViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.preferences.hostUrl.collect { host ->
                _state.update { it.copy(hostUrl = host) }
            }
        }
        viewModelScope.launch {
            container.preferences.token.collect { token ->
                _state.update { it.copy(token = token) }
                if (token != null) {
                    connectAndLoad(token)
                } else {
                    container.socketManager.disconnect()
                    _state.update { it.copy(messages = emptyList(), username = null) }
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
                    val without = st.messages.filterNot { it.messageId == msg.messageId }
                    st.copy(messages = listOf(msg) + without)
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
            _state.update { it.copy(messages = emptyList(), info = "Logged out", error = null) }
        }
    }

    fun refresh() {
        val token = _state.value.token ?: return
        viewModelScope.launch { loadMessages(token) }
    }

    fun clearMessages() {
        _state.update { it.copy(error = null, info = null) }
    }

    private suspend fun connectAndLoad(token: String) {
        container.socketManager.connect(token)
        loadMessages(token)
        registerFcm(token)
    }

    private suspend fun loadMessages(token: String) {
        _state.update { it.copy(loading = true, error = null) }
        try {
            val list = container.api.fetchMessages(token)
            _state.update { it.copy(loading = false, messages = list) }
        } catch (_: UnauthorizedException) {
            container.preferences.clearSession()
            _state.update { it.copy(loading = false, error = "Session expired") }
        } catch (e: ApiException) {
            _state.update { it.copy(loading = false, error = e.message) }
        } catch (e: Exception) {
            _state.update { it.copy(loading = false, error = e.message ?: "Load failed") }
        }
    }

    private suspend fun registerFcm(token: String) {
        runCatching {
            val fcm = FcmHelper.getTokenOrFallback()
            container.api.registerDevice(token, fcm)
        }
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return RelayViewModel(container) as T
        }
    }
}
