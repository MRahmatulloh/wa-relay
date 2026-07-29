package com.warelay.app.fcm

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

object FcmHelper {
    suspend fun getTokenOrFallback(): String {
        return try {
            FirebaseMessaging.getInstance().token.await()
        } catch (e: Exception) {
            Log.w("FcmHelper", "FCM unavailable, using local token: ${e.message}")
            "local-" + java.util.UUID.randomUUID().toString()
        }
    }
}
