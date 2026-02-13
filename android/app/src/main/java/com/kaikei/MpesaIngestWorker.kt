package com.kaikei

import android.content.ContentResolver
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * MpesaIngestWorker — WorkManager task for Tier 2.
 *
 * Reads the latest M-Pesa SMS from the inbox (using a time-window query
 * based on the notification timestamp) and passes the body to the
 * Headless JS task via MpesaHeadlessService.
 */
class MpesaIngestWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : Worker(context, workerParams) {

    companion object {
        private const val TAG = "MpesaIngestWorker"
    }

    override fun doWork(): Result {
        val notificationTime = inputData.getLong("notificationTime", 0)
        val notificationText = inputData.getString("notificationText") ?: ""

        Log.d(TAG, "Worker started, notification time: $notificationTime")

        try {
            // Query SMS inbox for the M-Pesa message within a 30-second window
            val smsBody = queryLatestMpesaSms(notificationTime)

            if (smsBody.isNullOrEmpty()) {
                // Fallback: use notification text if SMS query fails
                // (Android 15+ may redact SMS content)
                if (notificationText.length > 20) {
                    Log.d(TAG, "Using notification text as fallback")
                    startHeadlessTask(notificationText)
                    return Result.success()
                }
                Log.w(TAG, "No SMS found and notification text too short")
                return Result.failure()
            }

            startHeadlessTask(smsBody)
            return Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Worker failed", e)
            return Result.retry()
        }
    }

    /**
     * Query the SMS inbox for the latest M-Pesa message within a 30-second
     * time window centered around the notification timestamp.
     */
    private fun queryLatestMpesaSms(notificationTime: Long): String? {
        val contentResolver: ContentResolver = context.contentResolver
        val smsUri = Uri.parse("content://sms/inbox")

        // 30-second window around notification time
        val windowStart = notificationTime - 15_000
        val windowEnd = notificationTime + 15_000

        val cursor: Cursor? = contentResolver.query(
            smsUri,
            arrayOf("body", "date"),
            "address LIKE '%MPESA%' AND date >= ? AND date <= ?",
            arrayOf(windowStart.toString(), windowEnd.toString()),
            "date DESC LIMIT 1"
        )

        return cursor?.use {
            if (it.moveToFirst()) {
                it.getString(it.getColumnIndexOrThrow("body"))
            } else null
        }
    }

    /**
     * Start the Headless JS task via MpesaHeadlessService.
     */
    private fun startHeadlessTask(smsBody: String) {
        val bundle = Bundle().apply {
            putString("smsBody", smsBody)
        }
        MpesaHeadlessService.start(context, bundle)
    }
}
