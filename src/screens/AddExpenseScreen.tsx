import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
} from 'react-native';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
  SpeechStartEvent,
  SpeechEndEvent,
} from '@react-native-voice/voice';

const AddExpenseScreen: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [languageTried, setLanguageTried] = useState<'en-KE' | 'sw-KE' | null>(null);

  useEffect(() => {
    console.log('🔧 Voice listeners attached');
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;

    return () => {
      console.log('🧹 Cleanup');
      Voice.destroy().then(() => Voice.removeAllListeners());
    };
  }, []);

  const onSpeechStart = (e: SpeechStartEvent) => console.log('🎙️ onSpeechStart:', e);
  const onSpeechEnd = (e: SpeechEndEvent) => {
    console.log('🛑 onSpeechEnd:', e);
    setIsRecording(false);
  };

  const onSpeechResults = async (e: SpeechResultsEvent) => {
    console.log(`💬 onSpeechResults (${languageTried}):`, e);
    const text = e.value?.join(' ') || '';
    console.log('📝 Transcript:', text);

    if (!text && languageTried === 'en-KE') {
      // Retry Swahili if English failed
      console.log('🔁 English results empty → retrying with Swahili...');
      await retryWithSwahili();
      return;
    }

    if (languageTried === 'sw-KE') {
      console.log('🈶 Using Swahili transcript.');
    }

    setTranscript(text);
    setIsRecording(false);
  };

  const onSpeechError = async (e: SpeechErrorEvent) => {
    console.log('❌ onSpeechError:', e);
    setError(JSON.stringify(e.error));
    setIsRecording(false);

    if (languageTried === 'en-KE') {
      console.log('⚠️ English recognition failed → retrying Swahili');
      await retryWithSwahili();
    }
  };

  const requestAudioPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'This app needs access to your microphone to record audio.',
          buttonPositive: 'OK',
        },
      );
      const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
      console.log('🎤 Mic permission granted?', isGranted);
      return isGranted;
    } catch (err) {
      console.warn('Permission error', err);
      return false;
    }
  };

  const startRecording = async (lang: 'en-KE' | 'sw-KE' = 'en-KE') => {
    setError(null);
    setTranscript('');
    console.log(`▶️ Starting recording in ${lang}...`);

    const ok = await requestAudioPermission();
    if (!ok) {
      Alert.alert('Permission denied', 'Cannot start recording without microphone permission');
      return;
    }

    try {
      await Voice.start(lang);
      setLanguageTried(lang);
      setIsRecording(true);
      console.log('🎧 Recording started with language:', lang);
    } catch (e) {
      console.error('startRecording error', e);
      setError(String(e));
    }
  };

  const retryWithSwahili = async () => {
    console.log('🔁 Retrying speech recognition with Swahili...');
    try {
      await Voice.stop();
      await Voice.destroy();
      await new Promise(res => setTimeout(res, 500));
      await startRecording('sw-KE');
    } catch (err) {
      console.error('retryWithSwahili error', err);
      setError(String(err));
    }
  };

  const stopRecording = async () => {
    console.log('⏹️ Stopping recording...');
    try {
      await Voice.stop();
    } catch (e) {
      console.warn('stopRecording error', e);
    } finally {
      setIsRecording(false);
      console.log('📴 Recording stopped.');
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording('en-KE');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Expense — Auto Voice</Text>

      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.recordButton, isRecording && styles.recording]}
        onPress={toggleRecording}>
        <Text style={styles.buttonText}>{isRecording ? 'Stop' : 'Record'}</Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Status: {isRecording ? 'Recording…' : 'Idle'}</Text>
        <Text style={styles.label}>Transcript:</Text>
        <Text style={styles.transcript}>{transcript || '—'}</Text>
        {error ? <Text style={styles.error}>Error: {error}</Text> : null}
      </View>

      <Text style={styles.hint}>
        Language auto-switches between English (en-KE) and Swahili (sw-KE) depending on results.
      </Text>
    </View>
  );
};

export default AddExpenseScreen;

const styles = StyleSheet.create({
  container: {flex: 1, padding: 20, alignItems: 'center', backgroundColor: '#fff'},
  title: {fontSize: 20, fontWeight: '600', marginVertical: 12},
  recordButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#e33',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.2,
    elevation: 6,
  },
  recording: {backgroundColor: '#b00', transform: [{scale: 0.98}]},
  buttonText: {color: '#fff', fontSize: 18, fontWeight: '700'},
  infoBox: {
    width: '100%',
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  label: {fontSize: 14, fontWeight: '600'},
  transcript: {
    marginTop: 8,
    fontSize: 16,
    minHeight: 36,
    color: '#000', // 🖤 black text
  },
  error: {marginTop: 8, color: 'red'},
  hint: {
    marginTop: 18,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
