package com.kaikei

import android.app.Notification
import android.content.ContentResolver
import android.database.Cursor
import android.net.Uri
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * MpesaNotificationService — Tier 2: Always-on M-Pesa detection.
 *
 * Listens for M-Pesa notification events (works even on Android 15+ where
 * SMS_RECEIVED broadcast may be suppressed for sensitive notifications).
 * When a notification from MPESA is detected, enqueues a WorkManager task
 * that reads the actual SMS from the inbox and invokes the Headless JS task.
 */
class MpesaNotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "MpesaNotificationSvc"
        private const val MPESA_PACKAGE = "com.android.mms" // Default SMS app
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return

        try {
            val notification = sbn.notification ?: return
            val extras = notification.extras ?: return
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

            // Check if this is an M-Pesa notification
            val isMpesa = title.uppercase().contains("MPESA") ||
                    title.uppercase().contains("M-PESA") ||
                    text.uppercase().contains("MPESA")

            if (!isMpesa) return

            Log.d(TAG, "M-Pesa notification detected, enqueueing worker")

            // Enqueue a WorkManager task with the notification timestamp
            val data = Data.Builder()
                .putLong("notificationTime", sbn.postTime)
                .putString("notificationText", text)
                .build()

            val workRequest = OneTimeWorkRequestBuilder<MpesaIngestWorker>()
                .setInputData(data)
                .setInitialDelay(2, TimeUnit.SECONDS) // Brief delay for SMS to arrive in inbox
                .build()

            WorkManager.getInstance(applicationContext)
                .enqueueUniqueWork(
                    "mpesa_ingest_${sbn.postTime}",
                    ExistingWorkPolicy.KEEP,
                    workRequest
                )
        } catch (e: Exception) {
            Log.e(TAG, "Error processing notification", e)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // No-op
    }
}
