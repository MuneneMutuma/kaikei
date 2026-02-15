import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { ModelManager, MODEL_CONFIG } from '../services/llm/ModelManager';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Download, Trash2, Zap, WifiOff, Cpu, Lightbulb } from 'lucide-react-native';
import { LlmClient } from '../services/llm/LlmClient';
import { SettingsRepository } from '../services/settings/SettingsRepository';

export default function AiManagementScreen() {
    const insets = useSafeAreaInsets();
    const [isDownloading, setIsDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<string>('Checking...');
    const [isReady, setIsReady] = useState(false);

    const [catEnabled, setCatEnabled] = useState(true);
    const [adviceEnabled, setAdviceEnabled] = useState(true);
    const [preferLocal, setPreferLocal] = useState(false);
    const settingsRepo = React.useMemo(() => new SettingsRepository(), []);

    useEffect(() => {
        checkStatus();
        loadSettings();
        ModelManager.resumeDownloadIfActive();

        const unsubscribe = ModelManager.addListener((state) => {
            setIsDownloading(state.isDownloading);
            setProgress(state.progress);
            if (state.isDownloading) {
                setStatus(`Downloading... ${(state.progress * 100).toFixed(0)}%`);
            } else if (state.progress >= 1) {
                setStatus('Verifying...');
                checkStatus();
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const checkStatus = async () => {
        const ready = await ModelManager.isModelReady();
        setIsReady(ready);
        if (ready) {
            setStatus('Active');
            setProgress(1);
        } else {
            setStatus('Not Installed');
            setProgress(0);
        }
    };

    const loadSettings = async () => {
        const cat = await settingsRepo.isOfflineCategorizationEnabled();
        const advice = await settingsRepo.isOfflineAdviceEnabled();
        const prefer = await settingsRepo.isPreferLocalModelEnabled();
        setCatEnabled(cat);
        setAdviceEnabled(advice);
        setPreferLocal(prefer);
    };

    const toggleCat = async (val: boolean) => {
        setCatEnabled(val);
        await settingsRepo.setOfflineCategorizationEnabled(val);
    };

    const toggleAdvice = async (val: boolean) => {
        setAdviceEnabled(val);
        await settingsRepo.setOfflineAdviceEnabled(val);
    };

    const togglePreferLocal = async (val: boolean) => {
        setPreferLocal(val);
        await settingsRepo.setPreferLocalModelEnabled(val);
    };

    const handleDownload = async () => {
        if (isDownloading) return;
        try {
            await ModelManager.downloadModel();
        } catch (e: any) {
            Alert.alert("Download Failed", e.message);
        }
    };

    const handleDelete = async () => {
        Alert.alert(
            "Delete AI Brain?",
            "Offline features like categorization and advice will stop working when you are offline.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        await ModelManager.deleteModel();
                        await checkStatus();
                    }
                }
            ]
        );
    };

    const handleTest = async () => {
        if (!isReady) return;
        const start = Date.now();
        setStatus("Loading Model...");
        try {
            await LlmClient.getInstance().init();
            const time = Date.now() - start;
            Alert.alert("Success", `Model loaded in ${(time / 1000).toFixed(1)}s.\nReady for offline inference.`);
            setStatus("Active (Loaded)");
        } catch (e: any) {
            Alert.alert("Test Failed", e.message);
            setStatus("Error Loading");
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="AI & Intelligence" subtitle="Manage Offline Capabilities" showNotification={false} />

            <ScrollView contentContainerStyle={styles.content}>

                {/* Status Card */}
                <View style={[styles.card, isReady ? styles.cardActive : styles.cardInactive]}>
                    <View style={styles.cardHeader}>
                        <View style={styles.iconCircle}>
                            <Cpu size={24} color={isReady ? colors.primary : colors.textSecondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>Local AI Model (Qwen 0.5B)</Text>
                            <Text style={styles.cardStatus}>
                                Status: <Text style={{ fontWeight: 'bold', color: isReady ? colors.primary : colors.error }}>{status}</Text>
                            </Text>
                        </View>
                    </View>

                    {/* Progress Bar */}
                    {(isDownloading || progress > 0) && (
                        <View style={styles.progressContainer}>
                            <View style={[styles.progressBar, { width: `${progress * 100}%`, backgroundColor: isReady ? colors.primary : colors.info }]} />
                        </View>
                    )}

                    <Text style={styles.specText}>
                        Size: ~{(MODEL_CONFIG.size / 1024 / 1024).toFixed(0)} MB • Private • Offline Capable
                    </Text>

                    <View style={styles.actions}>
                        {!isReady && !isDownloading && (
                            <TouchableOpacity style={styles.actionBtn} onPress={handleDownload}>
                                <Download size={20} color="white" />
                                <Text style={styles.actionBtnText}>Download Model</Text>
                            </TouchableOpacity>
                        )}

                        {isDownloading && (
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.textSecondary }]} disabled>
                                <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
                                <Text style={styles.actionBtnText}>Downloading...</Text>
                            </TouchableOpacity>
                        )}

                        {isReady && (
                            <View style={styles.row}>
                                <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.primary }]} onPress={handleTest}>
                                    <Zap size={18} color={colors.primary} />
                                    <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Test Load</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.error, marginLeft: 12 }]} onPress={handleDelete}>
                                    <Trash2 size={18} color={colors.error} />
                                    <Text style={[styles.outlineBtnText, { color: colors.error }]}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>

                {/* Features Section */}
                <Text style={styles.sectionTitle}>Capabilities</Text>

                <View style={styles.featureRow}>
                    <View style={[styles.featureIcon, { backgroundColor: '#E8F5E9' }]}>
                        <WifiOff size={20} color={colors.primary} />
                    </View>
                    <View style={styles.featureText}>
                        <Text style={styles.featureTitle}>Offline Categorization</Text>
                        <Text style={styles.featureDesc}> Automatically categorizes M-Pesa expenses without internet.</Text>
                    </View>
                    <Switch
                        value={catEnabled}
                        onValueChange={toggleCat}
                        disabled={!isReady}
                        trackColor={{ false: '#ddd', true: colors.primary }}
                    />
                </View>

                <View style={styles.featureRow}>
                    <View style={[styles.featureIcon, { backgroundColor: '#E3F2FD' }]}>
                        <Lightbulb size={20} color={colors.info} />
                    </View>
                    <View style={styles.featureText}>
                        <Text style={styles.featureTitle}>Offline Advice (Beta)</Text>
                        <Text style={styles.featureDesc}>Get financial tips even when disconnected.</Text>
                    </View>
                    <Switch
                        value={adviceEnabled}
                        onValueChange={toggleAdvice}
                        disabled={!isReady}
                        trackColor={{ false: '#ddd', true: colors.primary }}
                    />
                </View>

                <View style={styles.featureRow}>
                    <View style={[styles.featureIcon, { backgroundColor: '#E3F2FD' }]}>
                        <Zap size={20} color={colors.info} />
                    </View>
                    <View style={styles.featureText}>
                        <Text style={styles.featureTitle}>Prefer Local Model</Text>
                        <Text style={styles.featureDesc}>Use offline AI even when online (saves data).</Text>
                    </View>
                    <Switch
                        value={preferLocal}
                        onValueChange={togglePreferLocal}
                        disabled={!isReady}
                        trackColor={{ false: '#ddd', true: colors.primary }}
                    />
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: 20,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border,
        elevation: 2,
    },
    cardActive: {
        borderColor: colors.primary,
        backgroundColor: '#F1F8E9' // Very light green
    },
    cardInactive: {
        borderColor: colors.border
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    iconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
        elevation: 1,
    },
    cardTitle: {
        ...typography.subHeader,
        fontSize: 16,
        color: colors.text,
    },
    cardStatus: {
        ...typography.caption,
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 4,
    },
    progressContainer: {
        height: 8,
        backgroundColor: '#E0E0E0',
        borderRadius: 4,
        marginBottom: 12,
        overflow: 'hidden'
    },
    progressBar: {
        height: '100%',
        borderRadius: 4
    },
    specText: {
        ...typography.caption,
        color: colors.textSecondary,
        marginBottom: 20,
    },
    actions: {
        marginTop: 0,
    },
    actionBtn: {
        backgroundColor: colors.primary,
        paddingVertical: 12,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnText: {
        color: 'white',
        fontWeight: 'bold',
        marginLeft: 8,
    },
    row: {
        flexDirection: 'row',
    },
    outlineBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'white'
    },
    outlineBtnText: {
        fontWeight: 'bold',
        marginLeft: 8,
        fontSize: 14
    },
    sectionTitle: {
        ...typography.subHeader,
        color: colors.textSecondary,
        fontSize: 14,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    featureIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    featureText: {
        flex: 1,
        marginRight: 12
    },
    featureTitle: {
        ...typography.body,
        fontWeight: 'bold',
        color: colors.text
    },
    featureDesc: {
        ...typography.caption,
        color: colors.textSecondary,
        marginTop: 2
    }
});
