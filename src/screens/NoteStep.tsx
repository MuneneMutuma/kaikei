import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";

const NoteStep: React.FC<{ note: string; setNote: (s: string) => void }> = ({ note, setNote }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Add a note (optional)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Bought tomatoes, boda fuel..."
        placeholderTextColor="#999"
        style={styles.input}
        multiline
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  label: { fontSize: 16, color: "#333", marginBottom: 8 },
  input: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 10,
    borderColor: "#DDD",
    borderWidth: 1,
    fontSize: 16,
    color: "#222",
    minHeight: 80,
    textAlignVertical: "top",
  },
});

export default NoteStep;
