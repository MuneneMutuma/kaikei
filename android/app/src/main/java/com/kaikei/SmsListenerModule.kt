package com.kaikei

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * SmsListenerModule — Native React Native module for Tier 1 (runtime SMS detection).
 *
 * Responsibilities:
 * - Register a BroadcastReceiver for SMS_RECEIVED while the RN bridge is alive
 * - Filter for M-Pesa messages and emit events to JS
 * - Expose utility methods for the Permissions Health Check UI
 */
class SmsListenerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SmsListenerModule"
        private const val EVENT_NAME = "onMpesaSmsReceived"
    }

    private var smsReceiver: BroadcastReceiver? = null

    override fun getName(): String = NAME

    // --- Tier 1: Runtime BroadcastReceiver ---

    @ReactMethod
    fun startListening() {
        if (smsReceiver != null) return // Already listening

        smsReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

                val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                // Group multi-part SMS by sender
                val fullBody = StringBuilder()
                var isMpesa = false

                for (msg in messages) {
                    val sender = msg.displayOriginatingAddress?.uppercase() ?: ""
                    if (sender.contains("MPESA") || sender.contains("M-PESA")) {
                        isMpesa = true
                        fullBody.append(msg.displayMessageBody)
                    }
                }

                if (isMpesa && fullBody.isNotEmpty()) {
                    val params = Arguments.createMap().apply {
                        putString("body", fullBody.toString())
                    }
                    sendEvent(EVENT_NAME, params)
                }
            }
        }

        val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
        filter.priority = IntentFilter.SYSTEM_HIGH_PRIORITY
        reactContext.registerReceiver(smsReceiver, filter)
    }

    @ReactMethod
    fun stopListening() {
        smsReceiver?.let {
            try {
                reactContext.unregisterReceiver(it)
            } catch (e: Exception) {
                // Already unregistered
            }
            smsReceiver = null
        }
    }

    // --- Health Check Utilities ---

    @ReactMethod
    fun isNotificationAccessEnabled(promise: Promise) {
        try {
            val enabled = NotificationManagerCompat
                .getEnabledListenerPackages(reactContext)
                .contains(reactContext.packageName)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openNotificationSettings() {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
        } catch (e: Exception) {
            // Fallback to app settings
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val ignoring = pm.isIgnoringBatteryOptimizations(reactContext.packageName)
            promise.resolve(ignoring)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    @Suppress("BatteryLife")
    fun requestBatteryOptimizationExemption() {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
        } catch (e: Exception) {
            // Fallback
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
        }
    }

    // --- Event Emitter ---

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }

    override fun onCatalystInstanceDestroy() {
        stopListening()
        super.onCatalystInstanceDestroy()
    }
}
