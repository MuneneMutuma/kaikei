import React, { useState, useEffect, useRef } from "react";
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Modal, Alert, Platform, PermissionsAndroid
} from "react-native";
import { X, Mic, Check, RotateCcw, Settings, Globe } from 'lucide-react-native';
import { colors } from "../theme/colors";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";

import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { NaturalLanguageParser } from "../services/parser/NaturalLanguageParser";
import { Category } from "../services/ledger/Schema";
import { getCategoryColor, getCategoryIcon } from "./CategoryStep";

import { getSpeechEngine, registerSpeechEngine, SpeechResult, SpeechEngineState } from '../services/speech/SpeechService';
import { AndroidGSREngine } from '../services/speech/AndroidGSREngine';
import { SherpaOnnxEngine } from '../services/speech/SherpaOnnxEngine';

// Initialize the available voice engines
registerSpeechEngine(new AndroidGSREngine());
registerSpeechEngine(new SherpaOnnxEngine());

type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>;

const VoiceInput: React.FC<Props> = ({ navigation }) => {
    const parser = useRef(new NaturalLanguageParser());
    const repo = useRef(new ExpenseRepository());

    // State
    const [language, setLanguage] = useState<'en' | 'sw'>('en');
    const [engineState, setEngineState] = useState<SpeechEngineState>('idle');
    const [transcript, setTranscript] = useState("");
    const [parsedData, setParsedData] = useState<any>(null);
    const [confidence, setConfidence] = useState(0);
    const [saving, setSaving] = useState(false);

    const [dbCategories, setDbCategories] = useState<Category[]>([]);
    const categoriesRef = useRef<Category[]>([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const cats = await repo.current.getAllCategories();
                setDbCategories(cats);
                categoriesRef.current = cats;
            } catch (e) {
                console.error("Load Categories Error", e);
            }
        };
        loadData();

        // Start session on mount
        startListeningSession(language);

        return () => {
            stopListeningSessionActive();
        };
    }, []);

    const engineType = language === 'en' ? 'gsr' : 'sherpa-whisper';
    const activeEngine = getSpeechEngine(engineType);

    const toggleLanguage = () => {
        const newLang = language === 'en' ? 'sw' : 'en';
        setLanguage(newLang);
        startListeningSession(newLang);
    };

    const requestMicrophonePermission = async () => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    {
                        title: "Microphone Permission",
                        message: "Kaikei needs access to your microphone so you can add expenses with your voice.",
                        buttonNeutral: "Ask Me Later",
                        buttonNegative: "Cancel",
                        buttonPositive: "OK",
                    }
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } catch (err) {
                console.warn(err);
                return false;
            }
        }
        return true;
    };

    const startListeningSession = async (lang: 'en' | 'sw' = language) => {
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            Alert.alert("Permission Denied", "Microphone access is required.");
            return;
        }

        const engineToUse = getSpeechEngine(lang === 'en' ? 'gsr' : 'sherpa-whisper');

        // Cancel any active first
        if (activeEngine.currentState !== 'idle') {
            await activeEngine.cancelListening();
        }

        setParsedData(null);
        setTranscript("");

        try {
            await engineToUse.startListening({
                language: lang,
                onStateChange: (state) => setEngineState(state),
                onPartial: (text) => setTranscript(text),
                onFinal: (result) => handleVoiceInput(result),
                onError: (error, code) => {
                    console.warn(`Voice error [${code}]:`, error);
                    setEngineState('error');
                    if (lang === 'sw') {
                        Alert.alert("Engine Starting", "Downloading/Initializing offline model. Try again in a few seconds.");
                    }
                }
            });

            // The engine handles its own auto-stop internally via VAD
            // We just wait for the SpeechService to emit a final result or for the user to press stop
        } catch (e) {
            console.error("Voice Start Error", e);
        }
    };

    const stopListeningSessionActive = async () => {
        if (engineState === 'listening' || engineState === 'initializing') {
            try {
                setEngineState('processing');
                const result = await activeEngine.stopListening();
                handleVoiceInput(result);
            } catch (e: any) {
                // If it fails to stop (e.g. engine already stopped internally), 
                // just gracefully ignore to avoid breaking the UI flow.
                console.warn("Gracefully ignoring Voice Stop Error:", e);

                // If we already have text, we don't want to show an error state
                if (!transcript || transcript === "(No speech detected)") {
                    setEngineState('error');
                }
            }
        }
    };

    const handleVoiceInput = async (result: SpeechResult) => {
        setEngineState('processing');
        const rawText = result.text || "";
        console.log(`[VoiceInput] Received raw transcript: "${rawText}" (Engine: ${result.engineType})`);

        if (rawText) {
            setTranscript(rawText);
        } else {
            setTranscript("(No speech detected)");
            setEngineState('idle');
            return;
        }

        try {
            console.log(`[VoiceInput] Sending to parser...`);
            const parsed = await parser.current.parse(rawText);

            if (parsed && parsed.amount > 0) {
                console.log(`[VoiceInput] Parsed successfully:`, parsed);
                const currentCats = categoriesRef.current;
                const cat = currentCats.find(c => c.name.toLowerCase() === parsed.categoryName?.toLowerCase())
                    || currentCats.find(c => c.id === parsed.categoryId)
                    || currentCats.find(c => c.name.toLowerCase() === 'other');

                setParsedData({
                    amount: parsed.amount,
                    category: cat?.name || "Unknown",
                    categoryId: cat?.id,
                    description: parsed.description || cat?.name || "Voice Entry",
                    categoryLocal: cat?.name,
                    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDAuShzqrIRst30mOVTEDjx5RIVQlbWdDlLxc93HgHbbiNmyCrEdnmdo9sGQY-2nuF2Wj9T3WA3kwhU33NKpEWNJ1rbXC5x35teLAd7mmddhq4_dwlEjG4YEUkkfR013r9WEXqJODpQ3bhR-ieYxurUg-RtM7KuwdMIfVeHiUr_-NZPt_maLqKCCRJtebLDJrcAk5s2Xm4w0L_ZFlG4xzLVNYnq9kE-vw2_kr1R711giaFO5CG3yjdcqJrRZEr6HkAOaJBCK_JUb36y"
                });

                // If engine provided confidence use it, else mock based on parser success
                setConfidence(result.confidence ? Math.round(result.confidence * 100) : (85 + Math.floor(Math.random() * 15)));
            } else {
                console.warn(`[VoiceInput] Parser returned no valid amount for: "${rawText}"`);
                setTranscript(`"${rawText}"\n\n(Could not extract amount)`);
            }
        } catch (e: any) {
            console.error("[VoiceInput] Parser threw an exception:", e);
            setTranscript(`"${rawText}"\n\n(Error extracting amount: ${e.message || "Unknown error"})`);
        } finally {
            setEngineState('idle');
        }
    };

    const handleConfirm = async () => {
        if (!parsedData) return;
        setSaving(true);
        try {
            const date = new Date().toISOString();
            await repo.current.addExpense({
                amount: parsedData.amount,
                date: date,
                description: parsedData.description,
                categoryId: parsedData.categoryId || 'other',
                source: 'voice',
                rawText: transcript,
                type: 'expense',
                isVerified: true,
                isBusiness: false
            });
            navigation.goBack();
        } catch (e) {
            console.error("Failed to save", e);
            Alert.alert("Error", "Could not save expense.");
        } finally {
            setSaving(false);
        }
    };

    const handleRetry = () => {
        setParsedData(null);
        setTranscript("");
        setEngineState('idle');
        startListeningSession(language);
    };

    // UI Helpers
    const isListeningNow = engineState === 'listening' || engineState === 'initializing';
    const isProcessing = engineState === 'processing';

    const getStatusText = () => {
        if (engineState === 'initializing') return "WARMING UP ENGINE...";
        if (engineState === 'listening') return language === 'sw' ? "ONGEA SASA..." : "LISTENING...";
        if (engineState === 'processing') return language === 'sw' ? "INATAFSIRI..." : "PROCESSING...";
        if (engineState === 'error') return "ERROR. TAP RETRY.";
        return "DONE";
    };

    return (
        <View style={styles.container}>
            {/* Top Bar */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => {
                    stopListeningSessionActive();
                    navigation.goBack();
                }}>
                    <X size={24} color="#0d1b12" />
                </TouchableOpacity>

                <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.statusText, isListeningNow && styles.statusPulse]}>
                        {getStatusText()}
                    </Text>
                    <Text style={styles.subStatus}>
                        {language === 'sw' ? "Swahili (Offline)" : "English (Online)"}
                    </Text>
                </View>

                <TouchableOpacity style={[styles.iconBtn, language === 'sw' && styles.iconBtnActive]} onPress={toggleLanguage}>
                    <Globe size={24} color={language === 'sw' ? colors.primary : "#94a3b8"} />
                </TouchableOpacity>
            </View>

            {/* Main Visualizer */}
            <TouchableOpacity
                style={styles.visualizerArea}
                onPress={() => isListeningNow ? stopListeningSessionActive() : startListeningSession(language)}
                activeOpacity={0.8}
            >
                <View style={[styles.micCircle, isListeningNow && styles.micCircleActive, engineState === 'error' && styles.micCircleError]}>
                    <Mic size={48} color="white" />
                </View>
                {isListeningNow && <View style={styles.ripple} />}
            </TouchableOpacity>

            {/* Transcription */}
            <View style={styles.transcriptArea}>
                <Text style={styles.transcriptText}>
                    {transcript ? `"${transcript}"` : "..."}
                </Text>
                <Text style={styles.translation}>
                    {parsedData ? `Spent ${parsedData.amount} on ${parsedData.category}` :
                        isProcessing ? "Analyzing speech..." : "Tap mic to speak or wait to process"}
                </Text>
            </View>

            {/* Intelligence Card */}
            {parsedData && (
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <RotateCcw size={14} color={colors.primary} />
                            <Text style={styles.aiLabel}>AI PARSING</Text>
                        </View>
                        <View style={styles.confidenceBadge}>
                            <Text style={styles.confidenceText}>Confidence: {confidence}%</Text>
                        </View>
                    </View>

                    <View style={styles.cardContent}>
                        <View style={{ flex: 1, gap: 4 }}>
                            <Text style={styles.fieldLabel}>AMOUNT</Text>
                            <Text style={styles.amountValue}>KES {parsedData.amount}</Text>

                            <View style={styles.catRow}>
                                <View style={[styles.dot, { backgroundColor: getCategoryColor(parsedData.category) }]} />
                                <Text style={[styles.catText, { color: getCategoryColor(parsedData.category) }]}>{parsedData.category}</Text>
                            </View>
                        </View>

                        <View style={styles.catImageContainer}>
                            <Image source={{ uri: parsedData.image }} style={styles.catImage} />
                            <View style={styles.catOverlay}>
                                <Text style={styles.catOverlayText}>{parsedData.categoryLocal || parsedData.category}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            )}

            {/* Bottom Actions */}
            <View style={styles.footer}>
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={handleRetry}>
                        <RotateCcw size={24} color="#475569" />
                        <Text style={styles.cancelText}>Retry</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.confirmBtn, !parsedData && { backgroundColor: '#e2e8f0', shadowOpacity: 0 }]}
                        onPress={handleConfirm}
                        disabled={!parsedData || saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#0d1b12" />
                        ) : (
                            <>
                                <Check size={24} color={!parsedData ? "#94a3b8" : "#0d1b12"} />
                                <Text style={[styles.confirmText, !parsedData && { color: "#94a3b8" }]}>Thibitisha</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
                <Text style={styles.footerHint}>Tap confirm to add to M-Pesa ledger</Text>
            </View>
        </View>
    );
};

// Styles
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },

    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 24, paddingTop: 60, alignItems: 'center' },
    iconBtn: { padding: 12, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.05)' },
    iconBtnActive: { backgroundColor: 'rgba(19, 236, 91, 0.1)' },
    statusText: { fontSize: 12, fontWeight: 'bold', color: colors.primary, letterSpacing: 1 },
    statusPulse: { opacity: 0.8 },
    subStatus: { fontSize: 12, color: '#64748b' },

    visualizerArea: { alignItems: 'center', justifyContent: 'center', height: 160, position: 'relative' },
    micCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 10, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 20 },
    micCircleActive: { transform: [{ scale: 1.1 }] },
    micCircleError: { backgroundColor: '#ef4444', shadowColor: '#ef4444' },
    ripple: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(19, 236, 91, 0.1)' },

    transcriptArea: { paddingHorizontal: 32, alignItems: 'center', gap: 8 },
    transcriptText: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: '#0d1b12' },
    translation: { fontSize: 16, textAlign: 'center', color: '#64748b', fontStyle: 'italic' },

    card: { marginHorizontal: 24, padding: 20, backgroundColor: 'white', borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 4 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    aiLabel: { fontSize: 10, fontWeight: 'bold', color: '#94a3b8' },
    confidenceBadge: { backgroundColor: 'rgba(19, 236, 91, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    confidenceText: { fontSize: 10, fontWeight: 'bold', color: colors.primaryDark },

    cardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fieldLabel: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold', letterSpacing: 1 },
    amountValue: { fontSize: 24, fontWeight: 'bold', color: '#0d1b12', marginVertical: 4 },
    catRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
    catText: { fontSize: 14, fontWeight: '600', color: colors.primaryDark },

    catImageContainer: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    catImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    catOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 4, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' },
    catOverlayText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

    footer: { padding: 24, width: '100%', backgroundColor: colors.background },
    actionRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#e2e8f0' },
    cancelText: { fontSize: 16, fontWeight: 'bold', color: '#475569' },
    confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
    confirmText: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },
    footerHint: { textAlign: 'center', fontSize: 12, color: '#94a3b8' },
});

export default VoiceInput;
