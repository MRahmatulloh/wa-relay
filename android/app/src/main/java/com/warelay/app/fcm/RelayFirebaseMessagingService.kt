package com.warelay.app.fcm

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.warelay.app.WaRelayApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class RelayFirebaseMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch {
            val app = application as WaRelayApp
            val jwt = app.container.preferences.getToken() ?: return@launch
            runCatching {
                app.container.api.registerDevice(jwt, token)
            }.onFailure { Log.w(TAG, "device register failed: ${it.message}") }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Log.d(TAG, "FCM data=${message.data}")
    }

    companion object {
        private const val TAG = "RelayFcm"
    }
}
