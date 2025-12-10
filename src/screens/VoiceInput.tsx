import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  Alert,
  StyleSheet,
} from "react-native";
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  OutputFormatAndroidType,
} from "react-native-nitro-sound";
import RNFS from "react-native-fs";
import { initWhisper, WhisperContext, addNativeLogListener } from "whisper.rn";
import AudioRecord from 'react-native-audio-record';

// ✅ Use AAC in MPEG4 container - most reliable for Android
// whisper.rn typically handles various formats, but 16kHz WAV is ideal.
// For now, we stick to what worked for recording, but we might need to transcode or configure
// whisper.rn to accept this.
// NOTE: whisper.rn supports decoding via FFmpegKit internally if available, or system APIs.
const audioSet = {
  AudioSourceAndroid: AudioSourceAndroidType.MIC,
  AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
  OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
  AudioEncodingBitRateAndroid: 128000,
  AudioSamplingRateAndroid: 16000,
  AudioChannelsAndroid: 1,
};

const VoiceInput = () => {
  const [recording, setRecording] = useState<boolean>(false);
  const [path, setPath] = useState<string | null>(null);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [modelReady, setModelReady] = useState<boolean>(false);

  const whisperContext = useRef<WhisperContext | null>(null);
  // const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current; // Removed: It's a singleton, use import directly.

  useEffect(() => {
    const initializeModel = async () => {
      try {
        console.log("📥 Initializing Whisper model...");
        // Initialize with a tiny model for quick testing.
        // In a real app, you might download a specific model to FS and pass the path.
        // For now, we'll try to use the 'tiny' model which whisper.rn can download/load.
        const context = await initWhisper({
          filePath: require('../../assets/ggml-tiny.en.bin'), // We need to ensure this asset exists or use a download URL
        });

        // Fallback if asset not bundled: Download it
        // const context = await initWhisper({
        //   filePath: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
        //   toFile: `${RNFS.DocumentDirectoryPath}/ggml-tiny.en.bin`,
        // });

        whisperContext.current = context;
        setModelReady(true);
        console.log("✅ Whisper model initialized!");
      } catch (error) {
        console.error("❌ Failed to init Whisper:", error);
        // Alert.alert("Model Error", "Failed to load Whisper model. Check logs.");
      }
    };

    initializeModel();
  }, []);

  useEffect(() => {
    console.log("🔍 Subscribing to Whisper native logs...");
    const listener = addNativeLogListener((level, message) => {
      console.log(`[WhisperNative] ${level}: ${message}`);
    });
    return () => {
      console.log("🔍 Unsubscribing from Whisper native logs...");
      listener.remove();
    }
  }, []);

  async function requestAndroidPermissions() {
    try {
      if (Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        ]);
        return Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );
      }
    } catch (err) {
      console.warn("Permission error:", err);
      return false;
    }
  }

  async function start() {
    if (!modelReady) {
      Alert.alert("Not Ready", "Whisper model is still loading...");
      return;
    }

    if (Platform.OS === "android") {
      const granted = await requestAndroidPermissions();
      if (!granted) {
        Alert.alert("Permission Required", "Microphone permission is required");
        return;
      }
    }

    try {
      const timestamp = Date.now();
      // react-native-audio-record saves to external cache dir or similar automatically.
      // We can specify 'wavFile' name.
      const fileName = `whisper_record_${timestamp}.wav`;

      console.log("📝 Initializing AudioRecord...");
      const options = {
        sampleRate: 16000,  // default 44100
        channels: 1,        // 1 or 2, default 1
        bitsPerSample: 16,  // 8 or 16, default 16
        audioSource: 6,     // android only (VOICE_RECOGNITION)
        wavFile: fileName   // default 'audio.wav'
      };

      AudioRecord.init(options);
      AudioRecord.start();

      // We don't get the path immediately on start with this lib, usually.
      // But we can construct it or wait for stop.
      // Let's set recording true.
      setRecording(true);
      setTranscribedText(null);
      setPath(null); // Clear previous path until stop

      console.log("🎙️ Recording started (WAV 16kHz)");
    } catch (error) {
      console.error("❌ Failed to start recording:", error);
      Alert.alert("Recording Error", String(error));
    }
  }

  async function stopAndTranscribe() {
    console.log("⏹️ Stopping Recording...");
    setLoading(true);

    try {
      const audioFile = await AudioRecord.stop();
      setRecording(false);

      const uri = `file://${audioFile}`;
      console.log('✅ Recording stopped at:', uri);

      if (!audioFile) throw new Error("Failed to get recording URI");

      setPath(uri);
      const originalPath = audioFile; // AudioRecord returns absolute path

      // Check file stats
      const fileExists = await RNFS.exists(originalPath);
      if (!fileExists) throw new Error("File does not exist at path: " + originalPath);

      const stats = await RNFS.stat(originalPath);
      console.log(`📂 File Stats: size=${stats.size}, path=${originalPath}`);

      if (stats.size < 1000) {
        console.warn("⚠️ File size is very small. Recording might be silent or failed.");
      }

      console.log('🚀 Starting transcription...');
      const startTime = Date.now();

      if (!whisperContext.current) {
        throw new Error("Whisper context not initialized");
      }

      // Transcribe
      const { promise } = await whisperContext.current.transcribe(originalPath, {
        language: 'en',
        tokenTimestamps: true,
      });

      const result = await promise;

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Transcription complete (${duration}s). Result:`, JSON.stringify(result, null, 2));

      setTranscribedText(result.result);

    } catch (error: any) {
      console.error("❌ Error:", error);
      Alert.alert("Error", error.message || String(error));
    } finally {
      setLoading(false);
    }
  }

  async function onStartPlay() {
    console.log('▶️ Playing...');
    try {
      if (!path) return;
      const msg = await AudioRecorderPlayer.startPlayer(path);
      const volume = await AudioRecorderPlayer.setVolume(1.0);
      console.log(`▶️ Playing started: ${msg}`);

      setIsPlaying(true);
      AudioRecorderPlayer.addPlayBackListener((e) => {
        if (e.currentPosition === e.duration) {
          console.log('⏹️ Playback finished');
          AudioRecorderPlayer.stopPlayer();
          AudioRecorderPlayer.removePlayBackListener();
          setIsPlaying(false);
        }
        return;
      });
    } catch (error) {
      console.error('❌ Failed to play:', error);
      Alert.alert('Playback Error', String(error));
    }
  }

  async function onStopPlay() {
    console.log('⏹️ Stopping Playback...');
    try {
      AudioRecorderPlayer.stopPlayer();
      AudioRecorderPlayer.removePlayBackListener();
      setIsPlaying(false);
    } catch (error) {
      console.error('❌ Failed to stop play:', error);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => (recording ? stopAndTranscribe() : start())}
        disabled={loading || isPlaying}
        style={[
          styles.button,
          { backgroundColor: loading ? "#999" : recording ? "#ff4444" : "#4444ff" }
        ]}
      >
        <Text style={styles.buttonText}>
          {loading ? "⏳ Processing..." : recording ? "⏹️ Stop & Transcribe" : "🎙️ Start Recording"}
        </Text>
      </TouchableOpacity>

      {path && !recording && !loading && (
        <TouchableOpacity
          onPress={() => (isPlaying ? onStopPlay() : onStartPlay())}
          style={[styles.button, { marginTop: 20, backgroundColor: isPlaying ? "#FFA500" : "#008000" }]}
        >
          <Text style={styles.buttonText}>
            {isPlaying ? "⏹️ Stop Playing" : "▶️ Play Recording"}
          </Text>
        </TouchableOpacity>
      )}

      {recording && (
        <View style={styles.statusContainer}>
          <Text style={styles.recordingText}>● Recording...</Text>
        </View>
      )}

      {modelReady ? (
        <Text style={styles.modelStatus}>🟢 Model Ready (Tiny English)</Text>
      ) : (
        <Text style={styles.modelStatus}>🔴 Loading Model...</Text>
      )}

      {transcribedText && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>🎯 Transcription:</Text>
          <Text style={styles.resultText}>{transcribedText}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
    justifyContent: "center",
  },
  button: {
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonText: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  statusContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  recordingText: {
    fontSize: 16,
    color: "#ff4444",
    fontWeight: "bold",
  },
  modelStatus: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
  },
  resultContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#e8f5e9",
    borderRadius: 10,
  },
  resultTitle: {
    fontWeight: "bold",
    fontSize: 16,
    color: "#2e7d32",
  },
  resultText: {
    marginTop: 10,
    fontSize: 14,
    color: "#1b5e20",
  },
});

export default VoiceInput;
