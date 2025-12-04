package com.kaikei.whisper

// Use an 'object' for a simple singleton
object WhisperConfig {
    const val SAMPLE_RATE = 16000
    const val N_FFT = 400
    const val HOP_LENGTH = 160
    const val N_MELS = 80 // 80 mels
    
    // 30-second chunk
    const val CHUNK_LENGTH = 30
    const val N_SAMPLES = CHUNK_LENGTH * SAMPLE_RATE // 480,000
    const val N_FRAMES = N_SAMPLES / HOP_LENGTH      // 3000 frames
    
    // Token IDs
    const val TOKEN_SOT = 50258
    const val TOKEN_TRANSCRIBE = 50360 // was 50358
    const val TOKEN_SW = 50318         // Kiswahili
    const val TOKEN_EN = 50259
    const val TOKEN_NOTIMESTAMPS = 50364
    const val TOKEN_EOT = 50257
}