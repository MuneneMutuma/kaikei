import AudioRecorderPlayer from 'react-native-audio-recorder-player';
const audioRecorderPlayer = new AudioRecorderPlayer();

async function startRecording() {
  const path = Platform.OS === 'android'
    ? '/sdcard/Download/whisper_record.wav' // or use cache dir
    : 'whisper_record.wav';
  const result = await audioRecorderPlayer.startRecorder(path);
  console.log('Recording to:', result); // path
  return result;
}

async function stopRecording() {
  const result = await audioRecorderPlayer.stopRecorder();
  audioRecorderPlayer.removeRecordBackListener();
  return result; // this is file path string
}