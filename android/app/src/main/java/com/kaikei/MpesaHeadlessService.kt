package com.kaikei

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * MpesaHeadlessService — HeadlessJsTaskService for Tier 2.
 *
 * Starts the React Native JS runtime (if not already running) and
 * invokes the 'MpesaIngestTask' registered in IngestionService.ts.
 * This allows the JS-side TransactionImporter to process the SMS
 * even when the app is killed.
 */
class MpesaHeadlessService : HeadlessJsTaskService() {

    companion object {
        private const val TAG = "MpesaHeadlessSvc"
        private const val TASK_NAME = "MpesaIngestTask"

        /**
         * Start the headless service from a Worker or other component.
         */
        fun start(context: Context, extras: Bundle) {
            val intent = Intent(context, MpesaHeadlessService::class.java)
            intent.putExtras(extras)
            try {
                context.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start headless service", e)
            }
        }
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras ?: return null
        val smsBody = extras.getString("smsBody") ?: return null

        Log.d(TAG, "Starting headless JS task: $TASK_NAME")

        val data = Arguments.createMap().apply {
            putString("smsBody", smsBody)
        }

        return HeadlessJsTaskConfig(
            TASK_NAME,
            data,
            60_000,  // 60s timeout
            true     // Allow in foreground
        )
    }
}
