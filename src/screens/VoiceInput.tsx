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
    NativeModules,
    NativeEventEmitter
} from "react-native";
import AudioRecord from "react-native-audio-record"; // Keeping for Whisper backup
import RNFS from "react-native-fs";
import { initWhisper, WhisperContext } from "whisper.rn";

// Custom Native Module
const { VoiceModule } = NativeModules;
const voiceEmitter = new NativeEventEmitter(VoiceModule);

// --- WHISPER CONFIG (BACKUP) --- 
const WHISPER_OPTIONS = {
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 1,
    wavFile: 'voice_input.wav'
};
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";
const MODEL_PATH = `${RNFS.DocumentDirectoryPath}/ggml-tiny.en.bin`;

import { NaturalLanguageParser } from "../services/parser/NaturalLanguageParser";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";

const VoiceInput = () => {
    // UI State
    const [isRecording, setIsRecording] = useState(false);
    const [result, setResult] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Engine Choice: 'GSR' | 'WHISPER'
    const ENGINE = 'GSR';

    // Whisper State (Backup)
    const [whisperReady, setWhisperReady] = useState(false);
    const whisperContext = useRef<WhisperContext | null>(null);
    const parser = useRef(new NaturalLanguageParser());
    const repo = useRef(new ExpenseRepository());

    useEffect(() => {
        if (ENGINE === 'GSR') {
            setupGSR();
        } else {
            setupWhisper(); // Only if we switch back
        }
        return () => {
            if (ENGINE === 'GSR') {
                removeAllListeners();
            }
        };
    }, []);

    // --- GOOGLE SPEECH IMPLEMENTATION ---

    const setupGSR = () => {
        try {
            voiceEmitter.addListener('onSpeechStart', onSpeechStart);
            voiceEmitter.addListener('onSpeechEnd', onSpeechEnd);
            voiceEmitter.addListener('onSpeechResults', onSpeechResults);
            voiceEmitter.addListener('onSpeechPartialResults', onSpeechPartialResults);
            voiceEmitter.addListener('onSpeechError', onSpeechError);
        } catch (e) {
            console.error("GSR Setup Error", e);
        }
    };

    const removeAllListeners = () => {
        voiceEmitter.removeAllListeners('onSpeechStart');
        voiceEmitter.removeAllListeners('onSpeechEnd');
        voiceEmitter.removeAllListeners('onSpeechResults');
        voiceEmitter.removeAllListeners('onSpeechPartialResults');
        voiceEmitter.removeAllListeners('onSpeechError');
    };

    const onSpeechStart = () => {
        setIsRecording(true);
        setResult(''); // Clear previous result
    };

    const onSpeechEnd = () => {
        setIsRecording(false);
    };

    const onSpeechPartialResults = (e: any) => {
        if (e.value && e.value[0]) {
            setResult(e.value[0]);
        }
    };

    const onSpeechResults = (e: any) => {
        console.log("GSR Results Received", e);
        // e.value is Array<string>
        if (e.value && e.value[0]) {
            const text = e.value[0];
            setResult(text);
            // Trigger processing automatically on final result
            handleProcessTransaction(text);
        }
    };

    const onSpeechError = (e: any) => {
        console.log('GSR Error:', e); // { code: 7, message: '...' }
        setIsRecording(false);

        // Error 7 = Network Error (Offline failed)
        // Error 13 = Language Unavailable (Offline Pack missing on Android 12+)
        if (e.code === 7 || e.code === 13 || (e.message && e.message.toLowerCase().includes('network'))) {
            Alert.alert(
                "Offline Voice Not Ready",
                "It seems you don't have the English/Swahili language pack installed for offline use.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Download Pack",
                        onPress: openVoiceSettings
                    }
                ]
            );
        }
    };

    const openVoiceSettings = () => {
        VoiceModule.openSettings();
    };

    const startGSR = async () => {
        setResult('');
        try {
            // Request permissions first!
            const granted = await requestAndroidPermissions();
            if (!granted) {
                Alert.alert("Permission", "Microphone permission needed.");
                return;
            }

            // Pass empty intent to use SYSTEM DEFAULT locale
            // This fixes the mismatch where we ask for en-US but user has en-GB installed
            await VoiceModule.startListening({
                locale: '',
                preferOffline: true
            });
        } catch (e) {
            console.error(e);
        }
    };

    const stopGSR = async () => {
        try {
            await VoiceModule.stopListening();
            // Do NOT manually process here. Result is not ready yet.
            // onSpeechResults will handle it.
        } catch (e) {
            console.error(e);
        }
    };

    // --- WHISPER IMPLEMENTATION (DETACHED / BACKUP) ---

    const setupWhisper = async () => {
        // ... (Existing Whisper setup logic, kept for reference)
        // ...
        // Initialize AudioRecord
        AudioRecord.init(WHISPER_OPTIONS);
        // ... Load Model ...
    }

    async function requestAndroidPermissions() {
        if (Platform.OS !== "android") return true;
        try {
            const androidVersion = Platform.Version;
            // Android 12+ usually deals with permissions differently but RECORD_AUDIO is standard
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    // --- COMMON PROCESSING ---

    const handleProcessTransaction = async (text: string) => {
        setIsProcessing(true);
        try {
            // 1. Predict Category
            const category = await parser.current.predictCategory(text);

            // 2. Extract Amount (Naive Regex for now or Parser improvement)
            const parsed = await parser.current.parse(text);

            if (!parsed) {
                Alert.alert("Partial Interpretation", `We heard: "${text}", but couldn't find an amount.`);
                return;
            }

            // 3. Save
            const saved = await repo.current.addExpense({
                amount: parsed.amount,
                date: new Date().toISOString(),
                description: parsed.description || text,
                categoryId: parsed.categoryId,
                source: 'voice',
                rawText: text
            });

            Alert.alert("Success", `Saved: ${saved.amount} for ${saved.description}`);
            setResult('');
        } catch (e) {
            Alert.alert("Error", "Could not process transaction.");
        } finally {
            setIsProcessing(false);
        }
    };


    return (
        <View style={styles.container}>
            <Text style={styles.title}>🎙️ Native Voice (GSR)</Text>

            <TouchableOpacity
                style={[styles.recordButton, isRecording ? styles.recording : null]}
                onPress={isRecording ? stopGSR : startGSR}
                disabled={isProcessing}
            >
                <Text style={styles.buttonText}>
                    {isRecording ? "⏹️ Stop" : "🎤 Record"}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={{ marginTop: 20 }}
                onPress={openVoiceSettings}
            >
                <Text style={{ color: '#2196F3' }}>⚙️ Offline Settings</Text>
            </TouchableOpacity>

            {isProcessing && (
                <View style={styles.processingContainer}>
                    <ActivityIndicator color="#2196F3" />
                    <Text style={styles.statusText}>Processing...</Text>
                </View>
            )}

            {result ? (
                <View style={styles.resultContainer}>
                    <Text style={styles.resultLabel}>Heard:</Text>
                    <Text style={styles.resultText}>{result}</Text>
                </View>
            ) : null}
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
});

export default VoiceInput;



