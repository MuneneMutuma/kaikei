package com.kaikei.whisper

import android.content.Context
import android.util.Log
import java.io.BufferedInputStream
import java.io.DataInputStream
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log10
import kotlin.math.pow

// Import your TarsosDSP FFT and HannWindow classes

import be.tarsos.dsp.util.fft.FFT // This is the correct class
import be.tarsos.dsp.util.fft.HannWindow
// ----------------------------------------------------------------

/**
 * Replicates the audio processing pipeline from OpenAI's Whisper.
 *
 * This class is responsible for loading audio and converting it into a
 * Log-Mel Spectrogram, precisely matching the Python implementation.
 *
 * This involves:
 * 1. Reading 16-bit PCM WAV data.
 * 2. Applying STFT reflection padding.
 * 3. Calculating a Hann-windowed STFT.
 * 4. Calculating the Power Spectrum (and dropping the Nyquist bin).
 * 5. Applying the pre-computed 80-bin Mel filter bank.
 * 6. Applying the Whisper-specific log/clamp/scale normalization.
 *
 * @param context The Android context, needed to load assets (mel filters).
 */
class WhisperFeatureExtractor(private val context: Context) {

    companion object {
        private const val TAG = "FeatureExtractor"
        
        // These MUST match the Python script
        private const val N_FFT = 400
        private const val HOP_LENGTH = 160
        private const val N_MELS = 80
    }

    /**
     * Lazily loads the 80-bin Mel filter bank from the assets.
     * This filter bank MUST be exported from the original Whisper repo.
     * Shape: [80][200]
     */
    private val melFilterBank: Array<FloatArray> by lazy {
        loadMelFilters(context)
    }

    /**
     * Public entry point.
     * Processes raw audio samples into a fully-normalized Log-Mel Spectrogram.
     */
    fun process(audioSamples: FloatArray): Array<FloatArray> {
        return generateLogMelSpectrogram(
            audioSamples,
            N_FFT,
            HOP_LENGTH,
            N_MELS
        )
    }

    // =========================================================================
    // STEP 1: AUDIO LOADING
    // (This is your existing readWavFile, which is correct)
    // =========================================================================

    /**
     * Reads a 16-bit PCM WAV file and returns normalized FloatArray [-1.0, 1.0]
     */
    @Throws(Exception::class)
    fun readWavFile(wavPath: String): FloatArray {
        Log.d(TAG, "readWavFile: Opening $wavPath")
        val file = File(wavPath)
        val dis = DataInputStream(BufferedInputStream(FileInputStream(file)))

        // Read and validate WAV header
        // ✅ --- FIX: Use new helper functions ---
        val chunkId = readString(dis, 4)
        Log.d(TAG, "readWavFile: ChunkID: $chunkId")
        if (chunkId != "RIFF") throw Exception("Invalid WAV file: Missing RIFF (found $chunkId)")
        
        val chunkSize = readIntLe(dis)
        Log.d(TAG, "readWavFile: ChunkSize: $chunkSize")
        
        val format = readString(dis, 4)
        Log.d(TAG, "readWavFile: Format: $format")
        if (format != "WAVE") throw Exception("Invalid WAV file: Missing WAVE")
        
        val subChunk1Id = readString(dis, 4)
        Log.d(TAG, "readWavFile: SubChunk1ID: $subChunk1Id")
        if (subChunk1Id != "fmt ") throw Exception("Invalid WAV file: Missing fmt")
        
        val subChunk1Size = readIntLe(dis)
        Log.d(TAG, "readWavFile: SubChunk1Size: $subChunk1Size")
        // We only care about bytes 16-36 if subChunk1Size > 16

        val audioFormat = readShortLe(dis)
        Log.d(TAG, "readWavFile: AudioFormat: $audioFormat (1=PCM)")
        if (audioFormat.toInt() != 1) throw Exception("Not a PCM file")
        
        val numChannels = readShortLe(dis)
        Log.d(TAG, "readWavFile: NumChannels: $numChannels")
        if (numChannels.toInt() != 1) throw Exception("File is not mono")
        
        val sampleRate = readIntLe(dis)
        Log.d(TAG, "readWavFile: SampleRate: $sampleRate")
        if (sampleRate != WhisperConfig.SAMPLE_RATE) Log.w(TAG, "WAV sample rate ($sampleRate) doesn't match expected ($WhisperConfig.SAMPLE_RATE)")

        val byteRate = readIntLe(dis)
        Log.d(TAG, "readWavFile: ByteRate: $byteRate")
        
        val blockAlign = readShortLe(dis)
        Log.d(TAG, "readWavFile: BlockAlign: $blockAlign")
        
        val bitsPerSample = readShortLe(dis)
        Log.d(TAG, "readWavFile: BitsPerSample: $bitsPerSample")
        if (bitsPerSample.toInt() != 16) throw Exception("File is not 16-bit PCM")

        // Skip any extra header data
        val expectedHeaderSize = 16
        if (subChunk1Size > expectedHeaderSize) {
            val skipBytes = subChunk1Size - expectedHeaderSize
            Log.w(TAG, "readWavFile: Skipping $skipBytes extra bytes in 'fmt' chunk")
            dis.skipBytes(skipBytes)
        }

        // Find data chunk
        var dataChunkId = readString(dis, 4)
        while(dataChunkId != "data") {
            Log.w(TAG, "readWavFile: Skipping unknown chunk: $dataChunkId")
            val chunkSize = readIntLe(dis)
            dis.skipBytes(chunkSize)
            dataChunkId = readString(dis, 4)
        }
        Log.d(TAG, "readWavFile: Found data chunk.")
        
        val dataSize = readIntLe(dis)
        Log.d(TAG, "readWavFile: Data size: $dataSize bytes")

        val bytes = ByteArray(dataSize)
        Log.d(TAG, "readWavFile: Reading $dataSize bytes of audio data...")
        dis.readFully(bytes)

        dis.close()
        Log.d(TAG, "readWavFile: Converting bytes to float array...")

        val samples = FloatArray(bytes.size / 2)
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

        for (i in samples.indices) {
            val pcm = buffer.getShort()
            samples[i] = pcm / 32768.0f // Normalize to [-1.0, 1.0]
        }
        Log.d(TAG, "readWavFile: Loaded ${samples.size} samples.")
        return samples
    }


    // =========================================================================
    // STEP 2: SPECTROGRAM GENERATION
    // (These functions REFLACE your old ones)
    // =========================================================================

    /**
     * The main audio-processing pipeline.
     */
    private fun generateLogMelSpectrogram(
        audioSamples: FloatArray,
        nFft: Int = N_FFT,
        hopLength: Int = HOP_LENGTH,
        nMels: Int = N_MELS
    ): Array<FloatArray> {

        // 1. APPLY STFT PADDING (CRITICAL MISMATCH #1)
        // This mimics torch.stft(center=True)
        val paddedAudio = stftPad(audioSamples, nFft)

        // 2. Create FFT object
        val fft = FFT(nFft, HannWindow())

        // 3. Calculate frame count on the *padded* audio
        val frameCount = (paddedAudio.size - nFft) / hopLength + 1
        if (frameCount <= 0) {
            Log.w(TAG, "Audio too short to process")
            return Array(nMels) { FloatArray(0) }
        }

        val melSpectrogram = Array(nMels) { FloatArray(frameCount) }
        val frame = FloatArray(nFft)

        // 4. Iterate over audio frames
        for (i in 0 until frameCount) {
            val frameStart = i * hopLength
            System.arraycopy(paddedAudio, frameStart, frame, 0, nFft)

            // 5. Compute FFT (in-place)
            fft.forwardTransform(frame) // Modifies 'frame'

            // 6. Compute *Power* Spectrum (CRITICAL MISMATCH #2 & #3)
            // This new function returns 200 bins, not 201.
            val powerSpectrum = calculatePowerSpectrumPacked(frame, nFft)

            // 7. Apply Mel Filterbank (CRITICAL MISMATCH #4)
            // Dot product: [80][200] @ [200] -> [80]
            val melBins = applyMelFilter(powerSpectrum, melFilterBank)

            // 8. Store the result for this frame
            for (j in 0 until nMels) {
                melSpectrogram[j][i] = melBins[j]
            }
        }

        // 9. APPLY FINAL NORMALIZATION (CRITICAL MISMATCH #5)
        return normalizeLogMelSpectrogram(melSpectrogram)
    }

    /**
     * Applies reflection padding of N_FFT/2 (200) samples to each side.
     * This replicates `torch.stft(center=True)`.
     * It also captures 'mode = "reflect"' from the Python script.
     */
    private fun stftPad(audio: FloatArray, nFft: Int): FloatArray {
        val padLength = nFft / 2

        if (audio.size <= padLength) {
            val out = FloatArray(audio.size + 2 * padLength)

            System.arraycopy(audio, 0, out, padLength, audio.size)
            return out
        }

        val out = FloatArray(audio.size + 2 * padLength)

        for (i in 0 until padLength) {
            val srcIdx = padLength - i
            out[i] = audio[srcIdx]
        }

        System.arraycopy(audio, 0, out, padLength, audio.size)

        for (i in 0 until padLength) {
            val srcIdx = audio.size - padLength - i
            out[padLength + audio.size + i] = audio[srcIdx]
        }

        return out
    }

    /**
     * Calculates the *Power* spectrum from TarsosDSP's packed FFT output.
     * CRITICAL: Returns `fftSize/2` (200) bins, dropping the Nyquist bin.
     */
    private fun calculatePowerSpectrumPacked(fftFrame: FloatArray, fftSize: Int): FloatArray {
        // TarsosDSP packed format:
        // [real[0], real[N/2], real[1], imag[1], ... real[N/2-1], imag[N/2-1]]
        
        val powerSpectrum = FloatArray(fftSize / 2) // 200 bins

        // DC component (real[0])
        powerSpectrum[0] = fftFrame[0] * fftFrame[0] // power = real^2

        // Other bins (real[k] + j*imag[k])
        // Loop from k=1 to 199 (N/2 - 1)
        for (k in 1 until fftSize / 2) {
            val real = fftFrame[2 * k]
            val imag = fftFrame[2 * k + 1]
            powerSpectrum[k] = real * real + imag * imag // power = real^2 + imag^2
        }

        // We *explicitly ignore* fftFrame[1] (the Nyquist bin)
        return powerSpectrum
    }

    /**
     * Loads the pre-computed Mel filters from `assets/models/mel_80_filters.csv`.
     *
     * (Run the Python script from my previous response to generate this file).
     */
    private fun loadMelFilters(context: Context): Array<FloatArray> {
        Log.d(TAG, "Loading Mel filters from assets...")
        val filters = Array(N_MELS) { FloatArray(N_FFT / 2) } // Shape [80][200]
        
        try {
            context.assets.open("models/mel_80_filters.csv").bufferedReader().useLines { lines ->
                lines.forEachIndexed { i, line ->
                    if (i < N_MELS) {
                        val row = line.split(",").map { it.toFloat() }
                        filters[i] = row.toFloatArray()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "CRITICAL: Failed to load 'mel_80_filters.csv'.", e)
            throw RuntimeException("Failed to load mel filters", e)
        }
        
        Log.d(TAG, "Mel filters loaded. Shape [${filters.size}][${filters[0].size}]")
        return filters
    }

    /**
     * Applies the Mel filterbank (dot product).
     * powerSpectrum: [200]
     * filterbank: [80][200]
     * Output: [80]
     */
    private fun applyMelFilter(
        powerSpectrum: FloatArray, // Should have size 200
        filterbank: Array<FloatArray> // Should have size [80][200]
    ): FloatArray {
        val amountOfFilters = filterbank.size // 80
        val melBins = FloatArray(amountOfFilters)

        for (k in 0 until amountOfFilters) {
            var sum = 0.0f
            // Dot product: sum(powerSpectrum[i] * filterbank[k][i])
            for (i in powerSpectrum.indices) { // i ranges from 0 to 199
                sum += powerSpectrum[i] * filterbank[k][i]
            }
            melBins[k] = sum
        }
        return melBins
    }

    /**
     * Applies the final Whisper-specific normalization.
     * This replicates `log_spec = (log_spec + 4.0) / 4.0`
     */
    private fun normalizeLogMelSpectrogram(melSpec: Array<FloatArray>): Array<FloatArray> {
        // This function modifies the array in-place for efficiency
        if (melSpec.isEmpty() || melSpec[0].isEmpty()) return melSpec

        val nRows = melSpec.size
        val nCols = melSpec[0].size

        // 1. Apply log10 and clamp
        var maxVal = -Float.MAX_VALUE
        for (i in 0 until nRows) {
            for (j in 0 until nCols) {
                val clampedVal = melSpec[i][j].coerceAtLeast(1e-10f)
                val logVal = log10(clampedVal)
                melSpec[i][j] = logVal
                if (logVal > maxVal) {
                    maxVal = logVal
                }
            }
        }

        // 2. Clamp relative to max (max(val, max - 8.0))
        val floorVal = maxVal - 8.0f
        for (i in 0 until nRows) {
            for (j in 0 until nCols) {
                melSpec[i][j] = melSpec[i][j].coerceAtLeast(floorVal)
            }
        }

        // 3. Final scale: (val + 4.0) / 4.0
        for (i in 0 until nRows) {
            for (j in 0 until nCols) {
                melSpec[i][j] = (melSpec[i][j] + 4.0f) / 4.0f
            }
        }
        return melSpec
    }

    // =========================================================================
    // STEP 3: SPECTROGRAM PADDING
    // (This pads the *final spectrogram* to 3000 frames)
    // =========================================================================
    
    /**
     * Pads or trims the final Log-Mel Spectrogram to N_FRAMES (3000).
     * The Python `pad_or_trim` is for audio, this one is for the spectrogram.
     *
     * @param spec The [80][n_cols] spectrogram.
     * @param nFrames The target frame count (e.g., 3000).
     * @return A *flattened* FloatArray of size [80 * 3000].
     */
    fun padOrTrimSpectrogram(spec: Array<FloatArray>, nFrames: Int): FloatArray {
        val nRows = spec.size // 80
        val nCols = if (nRows > 0) spec[0].size else 0
        
        // The "silent" value.
        // log10(1e-10) -> -10.0
        // max(-10.0, max-8.0) -> (assuming max > -2.0) -> max-8.0
        // (max-8.0 + 4.0) / 4.0 = (max-4.0)/4.0 -> This depends on the max...
        //
        // Let's re-calculate the "floor" value
        // The floor is (maxVal - 8.0).
        // The final value is (floorVal + 4.0) / 4.0 = (maxVal - 4.0) / 4.0
        // This is still dependent on maxVal.
        //
        // A safer "silent" value is -1.0
        // (log10(1e-10) -> -10.0. Clamped to -8.0 relative to max. Let's assume max is ~0.
        // (-8.0 + 4.0) / 4.0 = -1.0.
        // This is the correct "silent" floor value.
        val floorVal = -1.0f

        val flatOutput = FloatArray(nRows * nFrames)
        flatOutput.fill(floorVal)

        if (nCols == 0) {
            Log.w(TAG, "Spectrogram was empty, returning silent padding.")
            return flatOutput
        }
        
        val copyCols = nCols.coerceAtMost(nFrames)

        for (i in 0 until nRows) {
            // System.arraycopy(source, srcPos, dest, destPos, length)
            System.arraycopy(spec[i], 0, flatOutput, i * nFrames, copyCols)
        }
        return flatOutput
    }
    
    // =========================================================================
    // WAV HEADER HELPERS
    // (Your existing, correct functions)
    // =========================================================================
    
    @Throws(Exception::class)
    private fun readIntLe(dis: DataInputStream): Int {
        val bytes = ByteArray(4)
        dis.readFully(bytes)
        return (bytes[0].toInt() and 0xFF) or
                ((bytes[1].toInt() and 0xFF) shl 8) or
                ((bytes[2].toInt() and 0xFF) shl 16) or
                ((bytes[3].toInt() and 0xFF) shl 24)
    }

    @Throws(Exception::class)
    private fun readShortLe(dis: DataInputStream): Short {
        val bytes = ByteArray(2)
        dis.readFully(bytes)
        val result = (bytes[0].toInt() and 0xFF) or
                ((bytes[1].toInt() and 0xFF) shl 8)
        return result.toShort()
    }

    @Throws(Exception::class)
    private fun readString(dis: DataInputStream, length: Int): String {
        val bytes = ByteArray(length)
        dis.readFully(bytes)
        return String(bytes, Charsets.US_ASCII)
    }
}
