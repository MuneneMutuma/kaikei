import React, { useState, useEffect } from "react";
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Modal
} from "react-native";
import { X, Mic, Check, RotateCcw, Settings, Globe } from 'lucide-react-native';
import { colors } from "../theme/colors";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";

// Mock Native Module for now as we focus on UI
// In real app, this connects to the VoiceModule we saw earlier
const VoiceModule = {
    startListening: () => { },
    stopListening: () => { },
};

type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>; // Using AddExpense route for now

const VoiceInput: React.FC<Props> = ({ navigation }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [parsedData, setParsedData] = useState<any>(null);
    const [confidence, setConfidence] = useState(0);

    // Simulated "Live" Transcription
    const startSimulation = () => {
        setIsListening(true);
        setTranscript("");
        setParsedData(null);

        setTimeout(() => setTranscript("Nimetumia..."), 1000);
        setTimeout(() => setTranscript("Nimetumia mia mbili..."), 2000);
        setTimeout(() => setTranscript("Nimetumia mia mbili kwa chakula"), 3000);
        setTimeout(() => {
            setIsListening(false);
            setParsedData({
                amount: 200,
                category: "Food & Dining",
                categoryLocal: "Chakula",
                image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDAuShzqrIRst30mOVTEDjx5RIVQlbWdDlLxc93HgHbbiNmyCrEdnmdo9sGQY-2nuF2Wj9T3WA3kwhU33NKpEWNJ1rbXC5x35teLAd7mmddhq4_dwlEjG4YEUkkfR013r9WEXqJODpQ3bhR-ieYxurUg-RtM7KuwdMIfVeHiUr_-NZPt_maLqKCCRJtebLDJrcAk5s2Xm4w0L_ZFlG4xzLVNYnq9kE-vw2_kr1R711giaFO5CG3yjdcqJrRZEr6HkAOaJBCK_JUb36y"
            });
            setConfidence(98);
        }, 3500);
    };

    useEffect(() => {
        // Auto-start for demo feel
        startSimulation();
    }, []);

    const handleConfirm = () => {
        // Save logic here
        navigation.goBack();
    };

    const handleRetry = () => {
        startSimulation();
    };

    return (
        <View style={styles.container}>
            {/* Top Bar */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <X size={24} color="#0d1b12" />
                </TouchableOpacity>

                <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.statusText, isListening && styles.statusPulse]}>
                        {isListening ? "LISTENING..." : "DONE"}
                    </Text>
                    <Text style={styles.subStatus}>Inasikiza...</Text>
                </View>

                <TouchableOpacity style={styles.iconBtn}>
                    <Settings size={24} color="#94a3b8" />
                </TouchableOpacity>
            </View>

            {/* Main Visualizer */}
            <View style={styles.visualizerArea}>
                <View style={[styles.micCircle, isListening && styles.micCircleActive]}>
                    <Mic size={48} color="white" />
                </View>
                {/* Ripple rings would act here with Reanimated */}
                {isListening && <View style={styles.ripple} />}
            </View>

            {/* Transcription */}
            <View style={styles.transcriptArea}>
                <Text style={styles.transcriptText}>
                    {transcript ? `"${transcript}"` : "..."}
                </Text>
                <Text style={styles.translation}>
                    {parsedData ? `Spent ${parsedData.amount} on food` : "Speak clearly in Swahili or English"}
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
                                <View style={styles.dot} />
                                <Text style={styles.catText}>{parsedData.category}</Text>
                            </View>
                        </View>

                        <View style={styles.catImageContainer}>
                            <Image source={{ uri: parsedData.image }} style={styles.catImage} />
                            <View style={styles.catOverlay}>
                                <Text style={styles.catOverlayText}>{parsedData.categoryLocal}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            )}

            {/* Bottom Actions */}
            <View style={styles.footer}>
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={handleRetry}>
                        <X size={24} color="#475569" />
                        <Text style={styles.cancelText}>Ghairi</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                        <Check size={24} color="#0d1b12" />
                        <Text style={styles.confirmText}>Thibitisha</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.footerHint}>Tap confirm to add to M-Pesa ledger</Text>
            </View>
        </View>
    );
};

// Styles from artifact `voice_expense_capture`
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },

    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 24, paddingTop: 60, alignItems: 'center' },
    iconBtn: { padding: 12, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.05)' },
    statusText: { fontSize: 12, fontWeight: 'bold', color: colors.primary, letterSpacing: 1 },
    statusPulse: { opacity: 0.8 }, // Animation would handle this
    subStatus: { fontSize: 12, color: '#64748b' },

    visualizerArea: { alignItems: 'center', justifyContent: 'center', height: 160, position: 'relative' },
    micCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 10, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 20 },
    micCircleActive: { transform: [{ scale: 1.1 }] },
    ripple: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(19, 236, 91, 0.1)' },

    transcriptArea: { paddingHorizontal: 32, alignItems: 'center', gap: 8 },
    transcriptText: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#0d1b12' },
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
