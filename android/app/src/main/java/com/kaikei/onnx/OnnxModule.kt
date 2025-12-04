package com.kaikei.onnx

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.kaikei.whisper.WhisperConfig
import com.kaikei.whisper.WhisperFeatureExtractor
import com.kaikei.whisper.WhisperTokenizer
import com.antonkarpenko.ffmpegkit.FFmpegKit
import com.antonkarpenko.ffmpegkit.ReturnCode
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.OnnxTensor
import java.io.File
import java.io.FileOutputStream
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.nio.ByteBuffer
import kotlin.concurrent.thread
import kotlin.collections.mutableMapOf

class OnnxModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "OnnxModule"
    }

    private val ctx: Context = reactContext.applicationContext
    private var env: OrtEnvironment? = null

    private var encoderSession: OrtSession? = null
    private var decoderSession: OrtSession? = null
    // private var session: OrtSession? = null

    // --- Whisper Helper Classes ---
    // Lazily initialize our feature extractor and tokenizer
    private val featureExtractor: WhisperFeatureExtractor by lazy {
        WhisperFeatureExtractor(ctx)
    }
    private val tokenizer: WhisperTokenizer by lazy {
        WhisperTokenizer(ctx)
    }

    override fun getName() = "OnnxModule"

    /**
     * Loads the ONNX model from the assets folder.
     */
    @ReactMethod
    fun loadModel(promise: Promise) {
        thread {
            try {
                if (encoderSession != null && decoderSession != null) {
                    Log.d(TAG, "Both Models already loaded.")
                    promise.resolve("Models already loaded")
                    return@thread
                }

                Log.d(TAG, "Loading models...")
                env = OrtEnvironment.getEnvironment()
                val sessionOptions = OrtSession.SessionOptions()

                // 1. Load Encoder
                Log.d(TAG, "Loading encoder model...")
                val encoderFile = File(ctx.cacheDir, "encoder.onnx")
                ctx.assets.open("models/whisper-base-sw-kv-cache-onnx/encoder_model.onnx").use { inputStream ->
                    FileOutputStream(encoderFile).use { outputStream ->
                        inputStream.copyTo(outputStream)
                    }
                }
                encoderSession = env!!.createSession(encoderFile.absolutePath, sessionOptions)
                Log.d(TAG, "Encoder model loaded. Inputs: ${encoderSession!!.inputNames}")
                Log.d(TAG, "DEBUG: Encoder Output Names: ${encoderSession!!.outputNames}")

                // 2. Load Decoder
                Log.d(TAG, "Loading decoder model...")
                val decoderFile = File(ctx.cacheDir, "decoder_merged.onnx")
                ctx.assets.open("models/whisper-base-sw-kv-cache-onnx/decoder_model_merged.onnx").use { inputStream ->
                    FileOutputStream(decoderFile).use { outputStream ->
                        inputStream.copyTo(outputStream)
                    }
                }
                decoderSession = env!!.createSession(decoderFile.absolutePath, sessionOptions)
                Log.d(TAG, "Decoder model loaded. Inputs: ${decoderSession!!.inputNames}")

                promise.resolve("Encoder and Decoder models loaded successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Error loading models", e)
                promise.reject("LOAD_MODEL_ERROR", e.message, e)
            }
        }
    }

    //TODO: implement unLoadModel

    /**
     * Runs the full audio-to-text inference.
     */
    @ReactMethod
    fun runModel(originalAudioPath: String, promise: Promise) {
        thread {
            var outputWavFile: File? = null
            val tensorsToClose = mutableListOf<OnnxTensor>()
            try {
                val eSession = encoderSession ?: throw RuntimeException("Encoder not Loaded.")
                val dSession = decoderSession ?: throw RuntimeException("Decoder not Loaded.")
                val ortEnv = env ?: throw RuntimeException("Environment not loaded.")

                // --- 1. FFmpeg Conversion ---
                Log.d(TAG, "runModel: Starting FFmpeg conversion for $originalAudioPath")
                outputWavFile = File(ctx.cacheDir, "converted_${System.currentTimeMillis()}.wav")
                val command = "-y -i \"$originalAudioPath\" -acodec pcm_s16le -ac 1 -ar ${WhisperConfig.SAMPLE_RATE} -f wav \"${outputWavFile.absolutePath}\""
                
                val ffmpegSession = FFmpegKit.execute(command)
                if (!ReturnCode.isSuccess(ffmpegSession.returnCode)) {
                    throw RuntimeException("FFmpeg conversion failed: ${ffmpegSession.allLogsAsString}")
                }
                Log.d(TAG, "FFmpeg conversion successful.")

                // --- 2. Load Audio ---
                Log.d(TAG, "Loading WAV file...")
                var audioSamples = featureExtractor.readWavFile(outputWavFile.absolutePath)

                // --- 3. Pad/Trim Audio ---
                // The model expects exactly 30 seconds of audio (N_SAMPLES)
                Log.d(TAG, "Padding/trimming audio to ${WhisperConfig.N_SAMPLES} samples")
                audioSamples = padOrTrimAudio(audioSamples, WhisperConfig.N_SAMPLES)

                // --- 4. Process Audio to Log-Mel Spectrogram ---
                Log.d(TAG, "Generating Log-Mel Spectrogram...")
                val logMelSpec = featureExtractor.process(audioSamples)

                // --- 5. Pad Spectrogram & Create Input Tensor ---
                Log.d(TAG, "Padding spectrogram to ${WhisperConfig.N_FRAMES} frames")
                val flatSpec = featureExtractor.padOrTrimSpectrogram(
                    logMelSpec,
                    WhisperConfig.N_FRAMES
                )
                val inputBuffer = FloatBuffer.wrap(flatSpec)
                val inputShape = longArrayOf(1, WhisperConfig.N_MELS.toLong(), WhisperConfig.N_FRAMES.toLong())
                val inputTensor = OnnxTensor.createTensor(ortEnv, inputBuffer, inputShape)
                
                val inputs = mutableMapOf<String, OnnxTensor>()
                inputs["input_features"] = inputTensor
                tensorsToClose.add(inputTensor) // Add for cleanup

                // --- 6. Encode Prompt Tokens ---
                Log.d(TAG, "Running Encoder...")

                val encoderInputs = mapOf("input_features" to inputTensor)
                val encoderResults = eSession.run(encoderInputs)

                // --- THIS IS THE NEW DEBUG LOOP ---
                Log.d(TAG, "--- START ENCODER OUTPUTS (DEBUG) ---")
                try {
                    encoderResults.forEach { (key, value) ->
                        val valueType = value.javaClass.simpleName
                        var tensorInfo = "N/A"
                        if (value is ai.onnxruntime.OnnxTensor) {
                            tensorInfo = value.info.toString() // This gives type, shape, etc.
                        }
                        Log.d(TAG, "DEBUG: Key='$key', Type='$valueType', Info='$tensorInfo'")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "DEBUG: Error while looping results", e)
                }
                Log.d(TAG, "--- END ENCODER OUTPUTS (DEBUG) ---")
                // --- END NEW LOGIC ---

                var encoderHiddenStates: OnnxTensor? = null
                
                // Get the main output from the encoder
                // val encoderHiddenStates = encoderResults.get(0) as OnnxTensor
                encoderResults.forEach { (key, value) ->
                    if (key == "last_hidden_state" && value is OnnxTensor) {
                        encoderHiddenStates = value
                    }
                }

                if (encoderHiddenStates == null) throw RuntimeException("Encoder failed to produce hidden states")

                // encoderResults.close()


                // --- 7. Autoregressive Decoding Loop (with KV cache)---
                Log.d(TAG, "Starting autoregressive decoding loop...")
                
                // val promptText = "<|startoftranscript|><|en|><|transcribe|><|notimestamps|>"
                val promptIds = listOf(
                    WhisperConfig.TOKEN_SOT,
                    WhisperConfig.TOKEN_EN,
                    WhisperConfig.TOKEN_TRANSCRIBE,
                    WhisperConfig.TOKEN_NOTIMESTAMPS
                )
                // val promptIds = tokenizer.encode(promptText)
                val decoderIds = promptIds.map { it.toLong() }.toMutableList()

                Log.d(TAG, "decoderIds: $decoderIds")
                
                val maxTokens = 224 // Max tokens to generate

                // This map will hold our KV cache tensors
                val kvCacheInputs = mutableMapOf<String, OnnxTensor>()
                
                for (step in 0 until maxTokens) {
                    val decoderInputs = mutableMapOf<String, OnnxTensor>()

                    // 1. Add decoder_input_ids
                    // On step 0, this is the full prompt. On step > 0, it's just the *last* token
                    // 1. Add decoder_input_ids
                    // On step 0, this is the full prompt. On step > 0, it's just the *last* token
                     val (ids, shape) = if (step == 0) {
                         // Convert token IDs (Long) to Long values
                         Pair(decoderIds.toLongArray(), longArrayOf(1, decoderIds.size.toLong()))
                     } else {
                         Pair(longArrayOf(decoderIds.last()), longArrayOf(1, 1))
                     }

                     // Create Int64 tensor for input_ids
                     val decoderIdsTensor = OnnxTensor.createTensor(ortEnv, LongBuffer.wrap(ids), shape)
                    
                    
                    decoderInputs["input_ids"] = decoderIdsTensor
                    decoderInputs["encoder_hidden_states"] = encoderHiddenStates!!

                    // 3. Add all tensors from the KV cache
                    if (step == 0) {
                        // Initialize past_key_values with empty tensors for the first step
                        // Shape: [1, 8, 0, 64] - 8 heads, 0 sequence length, 64 dim
                        val useCacheBranchTensor = OnnxTensor.createTensor(ortEnv, booleanArrayOf(false))
                        decoderInputs["use_cache_branch"] = useCacheBranchTensor
                        tensorsToClose.add(useCacheBranchTensor)

                        val emptyPastShape = longArrayOf(1, 8, 0, 64)
                        val emptyFloatBuffer = FloatBuffer.allocate(0)
                        
                        for (i in 0 until 6) { // 6 layers for whisper-base
                            val keys = listOf(
                                "past_key_values.$i.decoder.key",
                                "past_key_values.$i.decoder.value",
                                "past_key_values.$i.encoder.key",
                                "past_key_values.$i.encoder.value"
                            )
                            for (key in keys) {
                                val tensor = OnnxTensor.createTensor(ortEnv, emptyFloatBuffer, emptyPastShape)
                                kvCacheInputs[key] = tensor
                                tensorsToClose.add(tensor)
                            }
                        }
                        
                    } else {
                         // use_cache_branch as int64 (1)
                        val useCacheBranchTensor = OnnxTensor.createTensor(
                            ortEnv, 
                            booleanArrayOf(true)
                        )
                        decoderInputs["use_cache_branch"] = useCacheBranchTensor
                        // Track for cleanup
                        tensorsToClose.add(useCacheBranchTensor)
                     }

                    Log.d(TAG, "use_cache_branch present: ${decoderInputs.containsKey("use_cache_branch")}")
                    decoderInputs.putAll(kvCacheInputs)

                    // --- DEBUG: Log Input Info ---
                    // if (step == 0) {
                    //     Log.d(TAG, "Decoder Input Info (Expected): ${dSession.inputInfo}")
                    //     dSession.inputInfo.forEach { (name, info) ->
                    //         Log.d(TAG, "Expected Input: $name, Info: $info")
                    //     }
                    // }

                    Log.d(TAG, "--- Debugging Actual Inputs for Step $step ---")
                    decoderInputs.forEach { (key, value) ->
                        Log.d(TAG, "Actual Input: key='$key', type='${value.info}'")
                    }

                    // --- Run Decoder ---
                    val decoderResults = dSession.run(decoderInputs)
                    Log.d(TAG, "Decoder Results: $decoderResults")
                    
                    // --- Extract the logits ---
                    val logitsTensor = decoderResults.get(0) as OnnxTensor
                    val logitsData = (logitsTensor.value as Array<Array<FloatArray>>)[0].last().copyOf()
                    logitsTensor.close() // Close logits tensor
                    
                // ... inside the loop, immediately after extracting logitsData ...

                    // 1. Prepare containers for the NEXT step
                    val nextStepInputs = mutableMapOf<String, OnnxTensor>()
                    val currentStepTensorsToClose = mutableListOf<OnnxTensor>()

                    // 2. Iterate over NEW results to decide what to keep
                    decoderResults.forEach { (key, value) ->
                        if (key.startsWith("present")) {
                            val pastKey = key.replace("present", "past_key_values")
                            val newTensor = value as OnnxTensor
                            
                            // Get the shape of the NEW tensor
                            val newShape = newTensor.info.shape // returns long[]
                            
                            // LOGIC: Is this an Encoder cache or Decoder cache?
                            val isEncoder = key.contains("encoder")
                            
                            // Check for the "Zero Batch" bug (garbage output)
                            // Valid encoder cache should be [1, 8, 1500, 64]. Garbage is usually [0, 8, 1, 64]
                            val isGarbage = newShape[0] == 0L

                            if (isEncoder && isGarbage) {
                                // CASE A: Garbage Encoder Update. 
                                // IGNORE the new tensor. RE-USE the old one.
                                val oldTensor = kvCacheInputs[pastKey]
                                if (oldTensor != null) {
                                    nextStepInputs[pastKey] = oldTensor
                                    // Do NOT add oldTensor to currentStepTensorsToClose
                                } else {
                                    Log.e(TAG, "CRITICAL: Attempted to reuse encoder cache but it was null!")
                                }
                            } else {
                                // CASE B: Valid Update (Decoder always, or Encoder Initial Step)
                                nextStepInputs[pastKey] = newTensor
                                
                                // Mark the OLD tensor to be closed
                                val oldTensor = kvCacheInputs[pastKey]
                                if (oldTensor != null) {
                                    currentStepTensorsToClose.add(oldTensor)
                                }
                            }
                        }
                    }

                    // 3. Close the tensors we decided to discard (the old ones we replaced)
                    currentStepTensorsToClose.forEach { it.close() }
                    currentStepTensorsToClose.clear()

                    // 4. Close other intermediate tensors
                    tensorsToClose.forEach { it.close() }
                    tensorsToClose.clear()
                    
                    // 5. Update the main map for the next loop iteration
                    kvCacheInputs.clear()
                    kvCacheInputs.putAll(nextStepInputs)
                    
                    // Note: We do NOT close decoderResults here, as 'nextStepInputs' holds references to it.
                    // We rely on the garbage collector or final cleanup to handle the Result container,
                    // but we successfully managed the underlying Tensors above.


                    // decoderResults.close() // Close the results container

                    // --- Sample Token ---
                    val allGeneratedTokens = decoderIds.drop(promptIds.size).map { it.toInt() }
                    applyRepetitionPenalty(logitsData, allGeneratedTokens, penalty = 1.2f)
                    val nextToken = sampleTopK(logitsData, temperature = 0.8f, k = 5)

                    // --- Cleanup and Add ---
                    // decoderIdsTensor.close() // close the toke tensor for *this* loop

                    if (nextToken == WhisperConfig.TOKEN_EOT) {
                        Log.d(TAG, "End token detected at step $step")
                        break
                    }
                    decoderIds.add(nextToken.toLong())
                }
                // --- 8. Decode Output Tokens ---
                Log.d(TAG, "Decoding output tokens...")
                val generatedTokenIds = decoderIds.drop(promptIds.size).map { it.toInt() }
                val decodedText = tokenizer.decode(generatedTokenIds)

                Log.i(TAG, "Final Transcription: $decodedText")
                promise.resolve(decodedText)

            } catch (e: Exception) {
                Log.e(TAG, "runModel: CRITICAL ERROR", e)
                promise.reject("RUN_ERROR", e.message, e)
            } finally {
                // Always try to delete the temp file
                // encoderResults?.close()
                outputWavFile?.delete()
                tensorsToClose.forEach { it.close() }
            }
        }
    }

    /**
     * Pads or trims a FloatArray to a target length.
     * Pads with 0.0f.
     */
    private fun padOrTrimAudio(array: FloatArray, length: Int): FloatArray {
        if (array.size == length) {
            return array
        }
        // 1. Trim if longer
        if (array.size > length) {
            return array.copyOfRange(0, length)
        }
        // 2. Pad if shorter (with zeros)
        val paddedArray = FloatArray(length) // Initializes to 0.0f
        System.arraycopy(array, 0, paddedArray, 0, array.size)
        return paddedArray
    }

    /**
     * Applies softmax to logits and returns the index (argmax) and
     * probability of the most likely token.
     */
    private fun softmaxAndArgmax(logits: FloatArray): Pair<Int, Float> {
        val maxLogit = logits.maxOrNull() ?: 0f
        val exps = logits.map { kotlin.math.exp((it - maxLogit).toDouble()) }
        val sumExps = exps.sum()
        
        var maxProb = 0.0f
        var maxIndex = 0

        for (i in logits.indices) {
            val prob = (exps[i] / sumExps).toFloat()
            if (prob > maxProb) {
                maxProb = prob
                maxIndex = i
            }
        }
        return Pair(maxIndex, maxProb)
    }

    /**
     * Replaces softmaxAndArgmax.
     * Applies temperature, filters to the top-k most probable tokens,
     * and then samples from that reduced distribution.
     *
     * @param logits The raw logits from the model.
     * @param temperature Controls randomness. 0.0 = greedy.
     * @param k The number of top tokens to consider.
     * @return The ID of the sampled token.
     */
    private fun sampleTopK(logits: FloatArray, temperature: Float = 0.8f, k: Int = 5): Int {
        if (temperature == 0.0f) {
            // Greedy search: just find the max index
            return logits.indices.maxByOrNull { logits[it] } ?: 0
        }

        // 1. Get original indices and pair them with logits
        val indexedLogits = logits.indices.map { Pair(it, logits[it]) }

        // 2. Filter to top-k
        val topKLogits = indexedLogits
            .sortedByDescending { it.second } // Sort by logit value, descending
            .take(k) // Take the top k

        // 3. Apply temperature and calculate stable softmax
        val (indices, scaledLogits) = topKLogits.map { (index, logit) ->
            Pair(index, (logit / temperature).toDouble())
        }.unzip()
        
        val maxLogit = scaledLogits.maxOrNull() ?: 0.0
        val exps = scaledLogits.map { kotlin.math.exp(it - maxLogit) }
        val sumExps = exps.sum()
        
        // 4. Create a probability distribution
        val probs = exps.map { it / sumExps }

        Log.d(TAG, "SampleTopK: Top 10 Tokens: $indices")

        // 5. Sample from the distribution
        val randomVal = Math.random()
        var cumulativeProb = 0.0
        for (i in probs.indices) {
            cumulativeProb += probs[i]
            if (randomVal < cumulativeProb) {
                return indices[i] // Return the original token ID
            }
        }

        // Fallback: return the most likely of the top-k
        return indices.lastOrNull() ?: 0
    }

    private fun applyRepetitionPenalty(
        logits: FloatArray,
        lastTokens: List<Int>,
        penalty: Float = 1.1f
    ) {
        if (lastTokens.isEmpty() || penalty == 1.0f) {
            return // No penalty to apply
        }

        val tokenSet = lastTokens.toSet()

        for (tokenId in tokenSet) {
            if (tokenId >= 0 && tokenId < logits.size) {
                // Apply penalty:
                // Logits are often negative. Dividing a negative logit by > 1.0
                // makes it *smaller* (more negative), which is correct.
                // e.g., -2.0 / 1.1 = -2.2
                // For positive logits, it also makes it smaller.
                // e.g., 2.0 / 1.1 = 1.8
                // This all correctly reduces the probability.
                logits[tokenId] = logits[tokenId] / penalty
            }
        }
    }
}
