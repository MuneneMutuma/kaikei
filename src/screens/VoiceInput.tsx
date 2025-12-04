import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  Alert,
} from "react-native";
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  OutputFormatAndroidType,
} from "react-native-nitro-sound";
import { NativeModules } from "react-native";
import RNFS from "react-native-fs";

const { OnnxModule } = NativeModules;

// ✅ Use AAC in MPEG4 container - most reliable for Android
const audioSet = {
  AudioSourceAndroid: AudioSourceAndroidType.MIC,
  AudioEncoderAndroid: AudioEncoderAndroidType.AAC,  // ✅ Changed from PCM_16BIT
  OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
  AudioEncodingBitRateAndroid: 128000,
  AudioSamplingRateAndroid: 16000,  // ✅ 16kHz
  AudioChannelsAndroid: 1,          // ✅ Mono
};

const VoiceInput = () => {
  const [recording, setRecording] = useState<boolean>(false);
  const [path, setPath] = useState<string | null>(null);
  const [whisperText, setWhisperText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  
  const audioRecorderPlayer = AudioRecorderPlayer;

  useEffect(() => {
    // 1. Define an async function right here
    const loadModelAsync = async () => {
      try {
        const msg = await OnnxModule.loadModel();
        console.log("✅ ONNX loaded:", msg);
      } catch (e) {
        console.error("❌ loadModel failed", e);
      }
    };

    // 2. Then, call it
    loadModelAsync();
  }, []);

  async function requestAndroidPermissions() {
    try {
      // ✅ For Android 13+ (API 33+), we don't need storage permissions
      // Only RECORD_AUDIO is required
      const androidVersion = Platform.Version;
      
      if (androidVersion >= 33) {
        // Android 13+
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert("Permission Required", "Microphone permission is required to record audio");
          return false;
        }
      } else {
        // Android 12 and below
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        ]);
        
        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allGranted) {
          Alert.alert("Permissions Required", "Please grant all permissions");
          return false;
        }
      }
      
      return true;
    } catch (err) {
      console.warn("Permission error:", err);
      Alert.alert("Permission Error", String(err));
      return false;
    }
  }

  async function start() {
    if (Platform.OS === "android") {
      const granted = await requestAndroidPermissions();
      if (!granted) return;
    }
    
    try {
      const timestamp = Date.now();
      
      // ✅ CRITICAL: Use app's internal cache directory (no permissions needed)
      // This avoids Android 13+ scoped storage issues
      const filePath = `${RNFS.CachesDirectoryPath}/whisper_record_${timestamp}.m4a`;
      
      console.log("📝 Recording to:", filePath);
      
      const uri = await audioRecorderPlayer.startRecorder(filePath, audioSet);
      setPath(uri);
      setRecording(true);
      setWhisperText(null);
      
      console.log("🎙️ Recording started");
    } catch (error) {
      console.error("❌ Failed to start recording:", error);
      Alert.alert("Recording Error", String(error));
    }
  }

  async function stopAndRun() {
    console.log("⏹️ Stopping Recording...");
    setLoading(true);
    
    try {
      const uri = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      setRecording(false);
      
      console.log('✅ Recording stopped at:', uri);
      
      if (!uri) {
        throw new Error("Failed to get recording URI");
      }

      setPath(uri);
      
      // Remove file:// prefix if present
      const originalPath = uri.replace('file://', '');
      
      // Verify file exists
      const fileExists = await RNFS.exists(originalPath);
      if (!fileExists) {
        throw new Error(`Recording file not found: ${originalPath}`);
      }
      
      // Check file size
      const fileInfo = await RNFS.stat(originalPath);
      console.log(`📊 Recording file size: ${fileInfo.size} bytes`);
      
      if (fileInfo.size < 1000) {
        throw new Error(`Recording too short (${fileInfo.size} bytes). Please record at least 1 second.`);
      }
      
      console.log('🚀 Starting transcription...');
      
      const startTime = Date.now();
      const tokenIds = await OnnxModule.runModel(originalPath);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`✅ Transcription complete (${duration}s):`, tokenIds);
      
      setWhisperText(tokenIds);
      
      // Optional: Clean up recording file after processing
      // await RNFS.unlink(originalPath);
      
      Alert.alert(
        "✅ Transcription Complete",
        `Processing time: ${duration}s\n\nToken IDs received. Implement tokenizer to decode text.`,
        [{ text: "OK" }]
      );
      
    } catch (error: any) {
      console.error("❌ Error:", error);
      Alert.alert(
        "Error",
        error.message || String(error),
        [{ text: "OK" }]
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ padding: 20, flex: 1, justifyContent: "center" }}>
      <TouchableOpacity
        onPress={() => (recording ? stopAndRun() : start())}
        disabled={loading}
        style={{
          backgroundColor: loading ? "#999" : recording ? "#ff4444" : "#4444ff",
          padding: 20,
          borderRadius: 15,
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 5,
        }}
      >
        <Text style={{ color: "white", fontSize: 20, fontWeight: "bold" }}>
          {loading ? "⏳ Processing..." : recording ? "⏹️ Stop & Transcribe" : "🎙️ Start Recording"}
        </Text>
      </TouchableOpacity>

      {recording && (
        <View style={{ marginTop: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 16, color: "#ff4444", fontWeight: "bold" }}>
            ● Recording...
          </Text>
        </View>
      )}

      {path && !recording && (
        <View style={{ marginTop: 20, padding: 15, backgroundColor: "#f0f0f0", borderRadius: 10 }}>
          <Text style={{ fontSize: 12, color: "#666", fontWeight: "bold" }}>
            📁 Saved:
          </Text>
          <Text style={{ fontSize: 10, color: "#888", marginTop: 5 }}>
            {path}
          </Text>
        </View>
      )}

      {whisperText && (
        <View style={{ marginTop: 20, padding: 15, backgroundColor: "#e8f5e9", borderRadius: 10 }}>
          <Text style={{ fontWeight: "bold", fontSize: 16, color: "#2e7d32" }}>
            🎯 Whisper Output:
          </Text>
          <Text style={{ marginTop: 10, fontSize: 14, color: "#1b5e20" }}>
            {whisperText}
          </Text>
          <Text style={{ marginTop: 10, fontSize: 12, color: "#666", fontStyle: "italic" }}>
            Note: These are token IDs. You need to implement a tokenizer to decode them into text.
          </Text>
        </View>
      )}
    </View>
  );
};

export default VoiceInput;
