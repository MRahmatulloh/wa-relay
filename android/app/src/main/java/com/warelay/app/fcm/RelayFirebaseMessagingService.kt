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
        Log.d(TAG, "FCM received notification=${message.notification != null} dataKeys=${message.data.keys}")
        val title = message.notification?.title
            ?: message.data["senderName"]
            ?: message.data["senderPhone"]
            ?: "WA Relay"
        val body = message.notification?.body
            ?: message.data["text"]
            ?: "New matched message"
        val id = (message.messageId ?: System.currentTimeMillis().toString()).hashCode()
        NotificationHelper.show(this, title, body, id)
    }

    companion object {
        private const val TAG = "RelayFcm"
        const val CHANNEL_ID = "wa_relay_messages"

        fun ensureChannel(context: android.content.Context) {
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return
            val manager = context.getSystemService(android.app.NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = android.app.NotificationChannel(
                CHANNEL_ID,
                "Matched messages",
                android.app.NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "WhatsApp matched message alerts"
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }
    }
}
