import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
// If you already use @react-native-voice/voice, keep using it and wire events here.
// For now, this is a minimal placeholder that accepts a transcript and returns parsed amount/category/note.
import Voice from "@react-native-voice/voice"; // ensure installed and linked

type Payload = { amount?: number; category?: string; note?: string };

const VoiceInput: React.FC<{ onSave: (payload?: Payload) => void }> = ({ onSave }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string>("");

  useEffect(() => {
    Voice.onSpeechResults = (e: any) => {
      const t = (e.value || []).join(" ");
      setTranscript(t);
    };
    Voice.onSpeechError = (e: any) => {
      console.warn("Voice error", e);
    };
    return () => {
      Voice.destroy().then(() => Voice.removeAllListeners && Voice.removeAllListeners());
    };
  }, []);

  const start = async () => {
    try {
      await Voice.start("en-KE");
      setIsRecording(true);
      setTranscript("");
    } catch (err) {
      console.warn("voice start failed", err);
      Alert.alert("Voice error", String(err));
    }
  };

  const stop = async () => {
    try {
      await Voice.stop();
    } catch (err) {
      console.warn("voice stop err", err);
    } finally {
      setIsRecording(false);
    }
  };

  const parseAndSave = () => {
    // VERY simple parse: find first number => amount. A real parser/LLM would replace this.
    const amountMatch = transcript.match(/(\d+(?:[.,]\d+)?)/);
    const amount = amountMatch ? Number(amountMatch[0].replace(",", "")) : undefined;
    // crude category guess
    const lc = transcript.toLowerCase();
    let category = undefined;
    if (lc.includes("fuel") || lc.includes("mafuta")) category = "Fuel";
    if (lc.includes("stock") || lc.includes("mboga")) category = category ?? "Stock";
    if (lc.includes("meal") || lc.includes("chai")) category = category ?? "Meals";

    onSave({ amount, category, note: transcript });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Voice quick add</Text>
      <Text style={styles.hint}>Tap record and say: "fuel 500" or "sukuma 200"</Text>

      <TouchableOpacity
        onPress={() => (isRecording ? stop() : start())}
        style={[styles.micButton, isRecording && styles.micActive]}
      >
        <Text style={styles.micText}>{isRecording ? "Stop" : "Record"}</Text>
      </TouchableOpacity>

      <View style={styles.transcriptBox}>
        <Text style={styles.transcriptTitle}>Transcript</Text>
        <Text style={styles.transcriptText}>{transcript || "—"}</Text>
      </View>

      <View style={styles.row}>
        <TouchableOpacity onPress={() => { parseAndSave(); }} style={styles.saveBtn}>
          <Text style={styles.saveText}>Save from voice</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  label: { fontSize: 16, fontWeight: "600", color: "#222", marginBottom: 6 },
  hint: { color: "#666", marginBottom: 12 },
  micButton: { width: 120, height: 120, borderRadius: 60, backgroundColor: "#E53935", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  micActive: { backgroundColor: "#B71C1C" },
  micText: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  transcriptBox: { backgroundColor: "#FFF", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#EEE", minHeight: 60, marginBottom: 12 },
  transcriptTitle: { fontWeight: "600", marginBottom: 6, color: "#333" },
  transcriptText: { color: "#222" },
  row: { flexDirection: "row" },
  saveBtn: { flex: 1, backgroundColor: "#3F51B5", padding: 12, borderRadius: 10, alignItems: "center" },
  saveText: { color: "#FFF", fontWeight: "700" },
});

export default VoiceInput;
