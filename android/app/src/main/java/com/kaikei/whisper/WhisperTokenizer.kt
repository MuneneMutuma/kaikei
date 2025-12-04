package com.kaikei.whisper

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.util.regex.Pattern

/**
 * Replicates the BPE Tokenizer used by OpenAI's Whisper model.
 * (Revised based on rigorous user feedback)
 *
 * @param context The Android context, needed to load assets.
 */
class WhisperTokenizer(private val context: Context) {

    companion object {
        private const val TAG = "Tokenizer"
    }

    // --- Lazily loaded properties ---

    private val encoder: Map<String, Int> by lazy {
        loadVocab(context)
    }

    private val decoder: Map<Int, String> by lazy {
        encoder.entries.associate { (k, v) -> v to k }
    }

    private val bpeRanks: Map<Pair<String, String>, Int> by lazy {
        loadMerges(context)
    }

    // FIX: Map key is Int (0-255), not Byte, to match Python's unsigned byte keys.
    private val byteToUnicode: Map<Int, String> by lazy {
        createByteToUnicodeMap()
    }

    // FIX: Add a lazy property for the <|unk|> token ID.
    private val unkId: Int by lazy {
        encoder["<|unk|>"] ?: run {
            Log.e(TAG, "CRITICAL: <|unk|> token not found in vocab.json!")
            // Use -1 as a sentinel value to be filtered out.
            // The model should not receive this.
            -1 
        }
    }
    
    // Cache for the BPE algorithm
    private val bpeCache = mutableMapOf<List<String>, List<String>>()

    // FIX: Add cache warm-up for common tokens.
    init {
        // Pre-warm the cache for the most common tokens
        // to avoid first-call latency.
        bpe(listOf("<|startoftranscript|>"))
        bpe(listOf("<|endoftext|>"))
        bpe(listOf("<|transcribe|>"))
        bpe(listOf("<|notimestamps|>"))
    }

    // --- Private Loading Functions ---

    private fun loadVocab(context: Context): Map<String, Int> {
        // ... (unchanged) ...
        Log.d(TAG, "Loading vocab.json")
        val vocab = mutableMapOf<String, Int>()
        try {
            val jsonStr = context.assets.open("models/vocab.json")
                .bufferedReader().use { it.readText() }
            val jsonObj = JSONObject(jsonStr)
            val keys = jsonObj.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                vocab[key] = jsonObj.getInt(key)
            }
        } catch (e: Exception) {
            Log.e(TAG, "CRITICAL: Failed to load 'vocab.json'", e)
            throw RuntimeException("Failed to load vocab", e)
        }
        Log.d(TAG, "Vocab loaded: ${vocab.size} entries")
        return vocab
    }

    private fun loadMerges(context: Context): Map<Pair<String, String>, Int> {
        // ... (unchanged) ...
        Log.d(TAG, "Loading merges.txt")
        val merges = mutableMapOf<Pair<String, String>, Int>()
        try {
            context.assets.open("models/merges.txt").bufferedReader().useLines { lines ->
                lines.drop(1).forEachIndexed { i, line ->
                    val parts = line.split(" ")
                    if (parts.size == 2) {
                        merges[Pair(parts[0], parts[1])] = i
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "CRITICAL: Failed to load 'merges.txt'.", e)
            throw RuntimeException("Failed to load merges", e)
        }
        Log.d(TAG, "Merges loaded: ${merges.size} entries")
        return merges
    }

    // =========================================================================
    // PUBLIC API: DECODE (Token IDs -> Text)
    // =========================================================================

    fun decode(tokenIds: List<Int>): String {
        val tokens = tokenIds.mapNotNull { decoder[it] }
        val text = tokens.joinToString(separator = "")

        // FIX: Removed .trim() to maintain exact fidelity with the
        // reference Python tokenizer, which does not trim whitespace.
        return text.replace("Ġ", " ")
    }

    // =========================================================================
    // PUBLIC API: ENCODE (Text -> Token IDs)
    // =========================================================================

    // This regex is a direct port from the Python implementation
    private val preTokenizationRegex: Pattern = try { 
        Pattern.compile(
            """'s|'t|'re|'ve|'m|'ll|'d| ?[\p{L}]+| ?[\p{N}]+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+""",
            // FIX: Add UNICODE_CHARACTER_CLASS flag for full regex fidelity
            Pattern.UNICODE_CHARACTER_CLASS 
        ) 
    } catch (e: IllegalArgumentException) {
        Pattern.compile(
            """'s|'t|'re|'ve|'m|'ll|'d| ?[\p{L}]+| ?[\p{N}]+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+"""
        ) 
    }

    fun encode(text: String): List<Int> {
        val tokenIds = mutableListOf<Int>()
        
        val matcher = preTokenizationRegex.matcher(text)
        while (matcher.find()) {
            val word = matcher.group(0)
            
            val wordBytes = word.toByteArray(Charsets.UTF_8)
            
            // FIX: This is the critical byte-handling fix.
            // Map the signed Kotlin Byte (e.g., -1) to an unsigned
            // Int (e.g., 255) to correctly index the byteToUnicode map.
            val bpeTokens = wordBytes.map { 
                byteToUnicode[it.toInt() and 0xFF]!! 
            }
            
            val mergedTokens = bpe(bpeTokens)

            // FIX: Use the unkId as a fallback instead of just logging.
            val ids = mergedTokens.map { encoder[it] ?: unkId }
            
            // Filter out any -1 (unknown) tokens
            tokenIds.addAll(ids.filter { it != -1 })
        }
        return tokenIds
    }

    private fun bpe(tokens: List<String>): List<String> {
        if (bpeCache.containsKey(tokens)) {
            return bpeCache[tokens]!!
        }

        if (tokens.isEmpty()) return emptyList()

        var word = tokens.toMutableList()
        var pairs = getPairs(word)

        while (true) {
            val bestPair = pairs.minByOrNull { bpeRanks[it] ?: Int.MAX_VALUE }
            
            if (bestPair == null || !bpeRanks.containsKey(bestPair)) {
                break
            }

            val newWord = mutableListOf<String>()
            var i = 0
            while (i < word.size) {
                if (i < word.size - 1 && word[i] == bestPair.first && word[i+1] == bestPair.second) {
                    newWord.add(bestPair.first + bestPair.second)
                    i += 2
                } else {
                    newWord.add(word[i])
                    i += 1
                }
            }
            
            word = newWord
            if (word.size == 1) {
                break
            } else {
                pairs = getPairs(word)
            }
        }
        
        bpeCache[tokens] = word
        return word
    }

    private fun getPairs(word: List<String>): Set<Pair<String, String>> {
        return (0 until word.size - 1).map { i ->
            Pair(word[i], word[i+1])
        }.toSet()
    }

    // =========================================================================
    // BYTE-TO-UNICODE MAP (CRITICAL for BPE)
    // =========================================================================

    /**
     * Creates the specific byte-to-unicode character map.
     * FIX: The map keys are now Ints (0-255) to match Python's
     * unsigned byte dictionary.
     */
    private fun createByteToUnicodeMap(): Map<Int, String> {
        val map = mutableMapOf<Int, String>()
        
        // Printable ASCII bytes (Ints 33-126)
        for (i in '!'..('~')) { map[i.code] = i.toString() }
        // Extended printable (Ints 161-172)
        for (i in '¡'..('¬')) { map[i.code] = i.toString() }
        // Extended printable (Ints 174-255)
        for (i in '®'..('ÿ')) { map[i.code] = i.toString() }

        var n = 0
        // Iterate over all 256 possible byte values (as Ints)
        for (i in 0..255) {
            if (!map.containsKey(i)) {
                map[i] = (256 + n).toChar().toString()
                n++
            }
        }
        return map
    }
}