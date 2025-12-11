import React, { useEffect, useState, useRef } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    Platform,
    PermissionsAndroid,
    Alert,
    StyleSheet,
    ActivityIndicator,
} from "react-native";
import AudioRecord from "react-native-audio-record";
import RNFS from "react-native-fs";
import { initWhisper, WhisperContext } from "whisper.rn";
import { Buffer } from "buffer";

// Configure 16kHz WAV for Whisper
const options = {
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 6, // VOICE_RECOGNITION
    wavFile: 'test.wav'
};

const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";
const MODEL_FILENAME = "ggml-tiny.en.bin";
const MODEL_PATH = `${RNFS.DocumentDirectoryPath}/${MODEL_FILENAME}`;

const VoiceInput = () => {
    const [recording, setRecording] = useState<boolean>(false);
    const [path, setPath] = useState<string | null>(null);
    const [transcribedText, setTranscribedText] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [isModelReady, setIsModelReady] = useState<boolean>(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

    const whisperContext = useRef<WhisperContext | null>(null);

    useEffect(() => {
        setupWhisper();
        // Initialize AudioRecord
        AudioRecord.init(options);
    }, []);

    const setupWhisper = async () => {
        try {
            const exists = await RNFS.exists(MODEL_PATH);
            if (!exists) {
                console.log("Downloading Whisper model...");
                const ret = RNFS.downloadFile({
                    fromUrl: MODEL_URL,
                    toFile: MODEL_PATH,
                    progress: (res) => {
                        const progress = (res.bytesWritten / res.contentLength) * 100;
                        setDownloadProgress(Math.round(progress));
                    },
                });
                await ret.promise;
                console.log("Model downloaded!");
                setDownloadProgress(null);
            }

            console.log("Initializing Whisper context...");
            const context = await initWhisper({ filePath: MODEL_PATH });
            whisperContext.current = context;
            setIsModelReady(true);
            console.log("Whisper initialized!");
        } catch (e) {
            console.error("Failed to setup Whisper:", e);
            Alert.alert("Setup Error", "Failed to load speech recognition model: " + e);
        }
    };

    async function requestAndroidPermissions() {
        if (Platform.OS !== "android") return true;
        try {
            const androidVersion = Platform.Version;
            if (typeof androidVersion === 'number' && androidVersion >= 33) {
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
            console.warn(err);
            return false;
        }
    }

    async function startRecording() {
        const hasPermission = await requestAndroidPermissions();
        if (!hasPermission) {
            Alert.alert("Permission Denied", "Audio recording permission is required.");
            return;
        }

        try {
            console.log("Starting recording...");
            AudioRecord.start();
            setRecording(true);
            setTranscribedText(null);
        } catch (error) {
            console.error("Recording error:", error);
        }
    }

    async function stopRecording() {
        if (!recording) return;
        try {
            console.log("Stopping recording...");
            const audioFile = await AudioRecord.stop();
            console.log("Audio file saved at:", audioFile);

            setRecording(false);
            setPath(audioFile);
            transcribeAudio(audioFile);
        } catch (error) {
            console.error("Stop recording error:", error);
        }
    }

    async function transcribeAudio(audioPath: string) {
        if (!whisperContext.current) {
            Alert.alert("Error", "Whisper model not loaded yet.");
            return;
        }

        setIsProcessing(true);
        try {
            console.log("Transcribing...", audioPath);
            const { promise } = whisperContext.current.transcribe(audioPath, {
                language: 'en',
            });
            const fullResult = await promise;
            console.log("Full Transcription Object:", JSON.stringify(fullResult, null, 2));
            const { result } = fullResult;
            setTranscribedText(result);
        } catch (error) {
            console.error("Transcription error:", error);
            Alert.alert("Error", "Transcription failed: " + error);
        } finally {
            setIsProcessing(false);
        }
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🎙️ Voice Expense Entry</Text>

            {!isModelReady && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#4CAF50" />
                    <Text style={styles.statusText}>
                        {downloadProgress !== null
                            ? `Downloading Model: ${downloadProgress}%`
                            : "Loading AI Model..."}
                    </Text>
                </View>
            )}

            {isModelReady && (
                <TouchableOpacity
                    style={[styles.recordButton, recording ? styles.recording : null]}
                    onPress={recording ? stopRecording : startRecording}
                    disabled={isProcessing}
                >
                    <Text style={styles.buttonText}>
                        {recording ? "⏹️ Stop" : "🎤 Record"}
                    </Text>
                </TouchableOpacity>
            )}

            {isProcessing && (
                <View style={styles.processingContainer}>
                    <ActivityIndicator color="#2196F3" />
                    <Text style={styles.statusText}>Transcribing...</Text>
                </View>
            )}

            {transcribedText && (
                <View style={styles.resultContainer}>
                    <Text style={styles.resultLabel}>Recognized Text:</Text>
                    <Text style={styles.resultText}>{transcribedText}</Text>
                </View>
            )}

            {path && <Text style={styles.debugText}>File: {path}</Text>}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 30,
        color: '#333',
    },
    recordButton: {
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: '#4CAF50',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    recording: {
        backgroundColor: '#e53935',
        transform: [{ scale: 1.1 }],
    },
    buttonText: {
        fontSize: 24,
        color: '#fff',
        fontWeight: 'bold',
    },
    loadingContainer: {
        marginBottom: 20,
        alignItems: 'center',
    },
    processingContainer: {
        marginTop: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        marginTop: 10,
        color: '#666',
    },
    resultContainer: {
        marginTop: 30,
        padding: 15,
        backgroundColor: '#f5f5f5',
        borderRadius: 10,
        width: '100%',
    },
    resultLabel: {
        fontWeight: 'bold',
        marginBottom: 5,
        color: '#333',
    },
    resultText: {
        fontSize: 16,
        color: '#333',
        lineHeight: 24,
    },
    debugText: {
        marginTop: 20,
        fontSize: 10,
        color: '#aaa',
    },
});

export default VoiceInput;

