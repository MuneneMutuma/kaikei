import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Platform, PermissionsAndroid, Alert } from "react-native";
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { NativeModules } from 'react-native';
const { OnnxModule } = NativeModules;

useEffect(() => {
	OnnxModule.loadModel()
	.then(msg => console.log('onnx loaded', msg))
	.catch(e => console.error('loadModel failed', e));
}, []);

const audioRecorderPlayer = new AudioRecorderPlayer();

async function requestAndroidPermissions() {
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    ]);
    return granted;
  } catch (err) {
    console.warn(err);
    return null;
  }
}

const VoiceInput = () => {
  const [recording, setRecording] = useState(false);
  const [path, setPath] = useState(null);
  const [whisperText, setWhisperText] = useState(null);

  async function start() {
    if (Platform.OS === 'android') await requestAndroidPermissions();
    const filePath = Platform.OS === 'android' ? '/sdcard/Download/whisper_record.wav' : 'whisper_record.wav';
    const uri = await audioRecorderPlayer.startRecorder(filePath);
    setPath(uri);
    setRecording(true);
  }

  async function stopAndRun() {
    const result = await audioRecorderPlayer.stopRecorder();
    audioRecorderPlayer.removeRecordBackListener();
    setRecording(false);
    setPath(result);
    try {
      await OnnxModule.loadModel(); // ensure model loaded
      const out = await OnnxModule.runModel(result);
      console.log('Whisper output:', out);
      setWhisperText(JSON.stringify(out));
    } catch (e) {
      console.error(e);
      Alert.alert('Inference error', String(e));
    }
  }

  return (
    <View>
      <TouchableOpacity onPress={() => (recording ? stopAndRun() : start())}>
        <Text>{recording ? 'Stop & transcribe' : 'Record'}</Text>
      </TouchableOpacity>
      <Text>{path}</Text>
      <Text>Whisper output: {whisperText}</Text>
    </View>
  );
};

export default VoiceInput;
