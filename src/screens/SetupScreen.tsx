import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

type SetupScreenProps = {
  onComplete: (name: string, persona: string) => void;
};

const personas = ['Mama Mboga', 'Bodaboda Rider', 'Mochi'];

const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
  const [name, setName] = useState('');
  const [selectedPersona, setSelectedPersona] = useState('');

  const handleSubmit = () => {
    if (name && selectedPersona) {
      console.log(`Selected Persona: ${selectedPersona}, Name: ${name}`);
      onComplete(name, selectedPersona);
    } else {
      console.log('Please fill in all fields');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Karibu! Let’s get to know you</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your name"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Select your role:</Text>
      {personas.map((p) => (
        <TouchableOpacity
          key={p}
          style={[
            styles.personaButton,
            selectedPersona === p && styles.selectedPersona,
          ]}
          onPress={() => setSelectedPersona(p)}
        >
          <Text
            style={[
              styles.personaText,
              selectedPersona === p && styles.selectedPersonaText,
            ]}
          >
            {p}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#fdfdfd',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  personaButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eee',
    marginBottom: 10,
  },
  selectedPersona: {
    backgroundColor: '#4CAF50',
  },
  personaText: {
    textAlign: 'center',
    color: '#333',
  },
  selectedPersonaText: {
    color: 'white',
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#2196F3',
    padding: 14,
    borderRadius: 10,
    marginTop: 20,
  },
  submitText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default SetupScreen;
