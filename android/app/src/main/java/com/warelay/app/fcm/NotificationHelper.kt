package com.warelay.app.fcm

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.warelay.app.MainActivity
import com.warelay.app.R

object NotificationHelper {
    fun show(
        context: Context,
        title: String,
        body: String,
        notifyId: Int = System.currentTimeMillis().toInt(),
    ) {
        RelayFirebaseMessagingService.ensureChannel(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, RelayFirebaseMessagingService.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(notifyId, notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS not granted
        }
    }
}
