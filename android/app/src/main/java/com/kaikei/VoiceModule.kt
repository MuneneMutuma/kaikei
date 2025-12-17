package com.kaikei

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class VoiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), RecognitionListener {

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false

    override fun getName(): String {
        return "VoiceModule"
    }

    @ReactMethod
    fun startListening(options: ReadableMap, promise: Promise) {
        Handler(Looper.getMainLooper()).post {
            try {
                if (speechRecognizer == null) {
                    speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)
                    speechRecognizer?.setRecognitionListener(this)
                }

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                
                // 1. Language Handling
                var lang = "en-US" // Default fallback
                if (options.hasKey("locale") && !options.getString("locale").isNullOrEmpty()) {
                    lang = options.getString("locale")!!
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                } else {
                    // If no locale provided, use system default (don't set EXTRA_LANGUAGE)
                    // intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toString())
                }
                
                // 2. Offline Preference
                var preferOffline = true
                if (options.hasKey("preferOffline")) {
                    preferOffline = options.getBoolean("preferOffline")
                }
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline)

                android.util.Log.d("VoiceModule", "Starting GSR: Lang=$lang, Offline=$preferOffline")

                speechRecognizer?.startListening(intent)
                isListening = true
                promise.resolve(true)
            } catch (e: Exception) {
                android.util.Log.e("VoiceModule", "Start Error: ${e.message}")
                promise.reject("START_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        Handler(Looper.getMainLooper()).post {
            try {
                speechRecognizer?.stopListening()
                isListening = false
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STOP_ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun destroy(promise: Promise) {
        Handler(Looper.getMainLooper()).post {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = null
                isListening = false
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("DESTROY_ERROR", e.message)
            }
        }
    }
    
    @ReactMethod
    fun openSettings() {
        // Try specific Intent for Offline Speech Recognition (Google App)
        try {
            val intent = Intent(Intent.ACTION_VIEW)
            intent.setClassName("com.google.android.googlequicksearchbox", "com.google.android.voicesearch.greco3.languagepack.InstallActivity")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            return
        } catch (e: Exception) {
            // Ignore, try next
        }

        // Try generic Voice Input Settings
        try {
            val intent = Intent(android.provider.Settings.ACTION_VOICE_INPUT_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            return
        } catch (e: Exception) {
            // Ignore
        }
        
        // Fallback to Application Details (so user can find settings manually)
        try {
             val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
             intent.data = android.net.Uri.parse("package:com.google.android.googlequicksearchbox")
             intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
             reactApplicationContext.startActivity(intent)
        } catch (e: Exception) {
             // Give up
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        if (reactApplicationContext.hasActiveCatalystInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    // --- RecognitionListener Implementation ---

    override fun onReadyForSpeech(params: Bundle?) {
        sendEvent("onSpeechStart", null)
    }

    override fun onBeginningOfSpeech() {
        sendEvent("onSpeechBegin", null)
    }

    override fun onRmsChanged(rmsdB: Float) {
        // Too noisy for bridge, usually ignored
    }

    override fun onBufferReceived(buffer: ByteArray?) {}

    override fun onEndOfSpeech() {
        sendEvent("onSpeechEnd", null)
    }

    override fun onError(error: Int) {
        val errorMessage = getErrorText(error)
        val params = Arguments.createMap()
        params.putInt("code", error)
        params.putString("message", errorMessage)
        
        // Error 7 = NETWORK_ERROR (Often means Offline Pack missing if we forced offline)
        sendEvent("onSpeechError", params)
    }

    override fun onResults(results: Bundle?) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val scores = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
        
        val params = Arguments.createMap()
        val matchArray = Arguments.createArray()
        matches?.forEach { matchArray.pushString(it) }
        
        params.putArray("value", matchArray)
        sendEvent("onSpeechResults", params)
    }

    override fun onPartialResults(partialResults: Bundle?) {
        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val params = Arguments.createMap()
        val matchArray = Arguments.createArray()
        matches?.forEach { matchArray.pushString(it) }
        
        params.putArray("value", matchArray)
        sendEvent("onSpeechPartialResults", params)
    }

    override fun onEvent(eventType: Int, params: Bundle?) {}

    private fun getErrorText(errorCode: Int): String {
        return when (errorCode) {
            SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
            SpeechRecognizer.ERROR_CLIENT -> "Client side error"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
            SpeechRecognizer.ERROR_NETWORK -> "Network error"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
            SpeechRecognizer.ERROR_NO_MATCH -> "No match"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "RecognitionService busy"
            SpeechRecognizer.ERROR_SERVER -> "Error from server"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech input"
            else -> "Didn't understand, please try again."
        }
    }
}
