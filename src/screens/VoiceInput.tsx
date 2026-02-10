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
    NativeEventEmitter,
    TextInput,
    Modal,
    FlatList,
    ScrollView
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

import { LlmClient } from '../services/llm/LlmClient';

interface VoiceInputProps {
    onSave?: (payload: { amount: number; category: string; note: string }) => void;
}

const VoiceInput = ({ onSave }: VoiceInputProps) => {
    // UI State
    const [isRecording, setIsRecording] = useState(false);
    const [result, setResult] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [llmStatus, setLlmStatus] = useState<string>('');
    const [reviewData, setReviewData] = useState<{ amount: string, category: string, note: string } | null>(null);

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
        setLlmStatus('');
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

    // Category Data
    const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
    const [catModalVisible, setCatModalVisible] = useState(false);
    const [customCat, setCustomCat] = useState('');
    const [isAddingCat, setIsAddingCat] = useState(false);

    useEffect(() => {
        // Load categories on mount
        const loadCats = () => {
            const all = repo.current.getAllCategories();
            setCategories(all);
        };
        loadCats();
    }, []);

    // --- COMMON PROCESSING ---

    const handleProcessTransaction = async (text: string) => {
        setIsProcessing(true);
        setLlmStatus('Extracting numbers...');

        try {
            // HYBRID STRATEGY:
            // 1. Regex (Trust Math)
            const regexResult = await parser.current.parse(text);
            const amount = regexResult?.amount || 0;

            if (amount === 0) {
                Alert.alert("Partial Interpretation", `We heard: "${text}", but couldn't find an amount.`);
                setIsProcessing(false);
                return;
            }

            // 2. LLM (Trust Intent)
            setLlmStatus('Thinking (AI)...');
            let category = regexResult?.categoryName || 'Other';
            let description = regexResult?.description || text;

            try {
                // Only call LLM if simple regex didn't find a strong category match or for better descriptions
                const llmClient = LlmClient.getInstance();
                const availableCats = repo.current.getAllCategories().map(c => c.name);

                // Race simple timeout (5s) for LLM
                const llmPromise = llmClient.categorize(text, availableCats);
                const timeoutPromise = new Promise<{ category?: string, description?: string }>((resolve) => setTimeout(() => resolve({}), 4000));

                const aiResult = await Promise.race([llmPromise, timeoutPromise]);

                if (aiResult.category) category = aiResult.category;
                if (aiResult.description) description = aiResult.description;

            } catch (llmErr) {
                console.warn("LLM failed, falling back to regex", llmErr);
            }

            // 3. Finalize - Set Review Data INSTEAD of saving
            setLlmStatus('Done!');
            setReviewData({
                amount: amount.toString(),
                category: category,
                note: description
            });

        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not process transaction.");
        } finally {
            setIsProcessing(false);
            setLlmStatus('');
        }
    };

    const handleConfirmSave = () => {
        if (!reviewData || !onSave) return;
        onSave({
            amount: parseFloat(reviewData.amount),
            category: reviewData.category,
            note: reviewData.note
        });
        setReviewData(null);
        setResult('');
    };

    const renderCategoryModal = () => (
        <Modal visible={catModalVisible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Select Category</Text>
                    {isAddingCat ? (
                        <View>
                            <TextInput
                                style={[styles.input, { marginBottom: 10 }]}
                                placeholder="New Category Name"
                                value={customCat}
                                onChangeText={setCustomCat}
                            />
                            <View style={styles.row}>
                                <TouchableOpacity onPress={() => setIsAddingCat(false)} style={[styles.btn, styles.btnCancel]}>
                                    <Text style={styles.btnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.btn, styles.btnConfirm]}
                                    onPress={() => {
                                        if (customCat) {
                                            setReviewData(prev => prev ? { ...prev, category: customCat } : null);
                                            setCatModalVisible(false);
                                            setCustomCat('');
                                            setIsAddingCat(false);
                                        }
                                    }}
                                >
                                    <Text style={styles.btnText}>Add</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <FlatList
                            data={[...categories, { id: 'custom', name: '+ Add New' }]}
                            keyExtractor={item => item.id}
                            style={{ maxHeight: 300 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.detailsRow}
                                    onPress={() => {
                                        if (item.id === 'custom') {
                                            setIsAddingCat(true);
                                        } else {
                                            setReviewData(prev => prev ? { ...prev, category: item.name } : null);
                                            setCatModalVisible(false);
                                        }
                                    }}
                                >
                                    <Text style={styles.detailsLabel}>{item.name}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                    {!isAddingCat && (
                        <TouchableOpacity style={[styles.btn, styles.btnCancel, { marginTop: 10 }]} onPress={() => setCatModalVisible(false)}>
                            <Text style={styles.btnText}>Close</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );

    // Render Review UI if we have data
    if (reviewData) {
        return (
            <View style={styles.container}>
                <Text style={[styles.title, { marginBottom: 20 }]}>Review Expense</Text>

                <View style={styles.card}>
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Amount</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            value={reviewData.amount}
                            onChangeText={t => setReviewData({ ...reviewData, amount: t })}
                        />
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Description</Text>
                        <TextInput
                            style={styles.input}
                            value={reviewData.note}
                            onChangeText={t => setReviewData({ ...reviewData, note: t })}
                        />
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Category</Text>
                        <TouchableOpacity
                            style={[styles.input, { justifyContent: 'center' }]}
                            onPress={() => setCatModalVisible(true)}
                        >
                            <Text style={{ fontSize: 16, color: '#333' }}>{reviewData.category}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.row}>
                        <TouchableOpacity
                            style={[styles.btn, styles.btnCancel]}
                            onPress={() => { setReviewData(null); setResult(''); }}
                        >
                            <Text style={styles.btnText}>Retry</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.btn, styles.btnConfirm]}
                            onPress={handleConfirmSave}
                        >
                            <Text style={styles.btnText}>✅ Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                {renderCategoryModal()}
            </View>
        )
    }

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
                    <Text style={styles.statusText}>{llmStatus || "Processing..."}</Text>
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
    },
    // Review UI Styles
    card: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        elevation: 6,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
    },
    formGroup: {
        width: '100%',
        marginBottom: 15
    },
    label: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 5,
        color: '#555'
    },
    input: {
        backgroundColor: '#f6f7f9',
        padding: 14,
        borderRadius: 10,
        color: '#333',
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0'
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 15
    },
    btn: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 5
    },
    btnCancel: {
        backgroundColor: '#666', // Darker grey for white text contrast
    },
    btnConfirm: {
        backgroundColor: '#3F51B5' // Using app primary color
    },
    btnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 16
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        maxHeight: '70%'
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 15,
        textAlign: 'center',
        color: '#333'
    },
    detailsRow: {
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    detailsLabel: {
        fontSize: 16,
        color: '#333'
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



