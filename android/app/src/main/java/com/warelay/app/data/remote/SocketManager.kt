package com.warelay.app.data.remote

import com.warelay.app.data.model.MatchedMessage
import com.warelay.app.data.prefs.UserPreferences
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URI

class SocketManager(private val preferences: UserPreferences) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var socket: Socket? = null

    private val _events = MutableSharedFlow<MatchedMessage>(extraBufferCapacity = 64)
    val events: SharedFlow<MatchedMessage> = _events.asSharedFlow()

    fun connect(token: String) {
        scope.launch {
            disconnect()
            val host = preferences.getHostUrl()
            val opts = IO.Options().apply {
                auth = mapOf("token" to token)
                reconnection = true
                forceNew = true
            }
            val s = IO.socket(URI.create(host), opts)
            s.on(Socket.EVENT_CONNECT) {
                // connected
            }
            s.on("message:matched") { args ->
                val raw = args.firstOrNull() ?: return@on
                val obj = when (raw) {
                    is JSONObject -> raw
                    is String -> JSONObject(raw)
                    else -> return@on
                }
                _events.tryEmit(ApiClient.parseMessage(obj))
            }
            s.connect()
            socket = s
        }
    }

    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
    }
}
