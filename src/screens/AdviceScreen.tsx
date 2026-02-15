import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView, Platform, RefreshControl, Alert, LayoutAnimation, UIManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenHeader';
import { ModelManager } from '../services/llm/ModelManager';
import { LlmClient } from '../services/llm/LlmClient';
import { getAIAdvice } from '../services/llm/HuggingFaceService';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { SettingsRepository } from '../services/settings/SettingsRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Zap, Cloud, Wallet, Sparkles, TrendingUp, AlertCircle, RefreshCw, Lightbulb, TrendingDown } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { MotiView } from 'moti';


if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

interface CategoryTotal {
    name: string;
    total: number;
}

const AdviceScreen = () => {
    const insets = useSafeAreaInsets();

    // State
    const [advice, setAdvice] = useState<string>('');
    const [loading, setLoading] = useState(false);

    // Data Context
    const [currentTotal, setCurrentTotal] = useState(0);
    const [breakdown, setBreakdown] = useState<CategoryTotal[]>([]);
    const [history, setHistory] = useState<{ month: string, total: number }[]>([]);
    const [insights, setInsights] = useState<string[]>([]);
    const [topCategories, setTopCategories] = useState<{ name: string, amount: number }[]>([]); // For Cloud Fallback

    const [persona, setPersona] = useState('User');
    const [preferLocal, setPreferLocal] = useState(false);
    const [isModelReady, setIsModelReady] = useState(false);

    const repo = new ExpenseRepository();
    const settingsRepo = new SettingsRepository();

    const loadData = async () => {
        try {
            const userSettings = await settingsRepo.getUserSettings();
            setPersona(userSettings.userPersona);

            // Settings
            const prefer = await settingsRepo.isPreferLocalModelEnabled();
            const ready = await ModelManager.isModelReady();
            setPreferLocal(prefer);
            setIsModelReady(ready);

            // Get Rich Context
            const context = await repo.getAdviceContext();

            setCurrentTotal(context.currentMonth.total);
            setBreakdown(context.currentMonth.breakdown);
            setHistory(context.history);
            setInsights(context.insights);

            // Also get summary for top categories (needed for Cloud simple view if we fallback, but we can reuse breakdown)
            const sorted = [...context.currentMonth.breakdown].sort((a, b) => b.total - a.total).slice(0, 3);
            setTopCategories(sorted.map(c => ({ name: c.name, amount: c.total })));

        } catch (e) {
            console.error("Failed to load advice context:", e);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const toggleSource = async () => {
        if (!isModelReady && !preferLocal) {
            Alert.alert("Offline Brain Not Ready", "Please download the model in Settings > AI & Intelligence first.");
            return;
        }

        LayoutAnimation.configureNext({
            duration: 400,
            update: { type: LayoutAnimation.Types.spring, springDamping: 0.8 },
        });

        const newVal = !preferLocal;
        setPreferLocal(newVal);
        setAdvice(''); // Clear result
        await settingsRepo.setPreferLocalModelEnabled(newVal);
    };

    const handleGetAdvice = async () => {
        if (currentTotal === 0 && breakdown.length === 0) {
            Alert.alert("No Data", "Track some expenses first!");
            return;
        }

        setLoading(true);
        setAdvice('');

        try {
            // Build Shared Context Strings
            const breakdownStr = breakdown.map(c => `- ${c.name}: KES ${c.total.toLocaleString()}`).join('\n');
            const historyStr = history.map(h => `- ${h.month}: KES ${h.total.toLocaleString()}`).join('\n');
            const insightStr = insights.length > 0 ? "Key Insights:\n" + insights.map(i => `- ${i}`).join('\n') : "";

            const fullContext = `
            Current Month Total: KES ${currentTotal.toLocaleString()}
            
            Category Breakdown:
            ${breakdownStr}
            
            Last 3 Months History:
            ${historyStr}
            
            ${insightStr}
            `;

            if (preferLocal) {
                // --- LOCAL MODE ---
                if (!isModelReady) {
                    Alert.alert("Error", "Local model is missing.");
                    setLoading(false);
                    return;
                }

                const systemPrompt = `You are a senior financial analyst in Kenya. Your client is a "${persona}".
                Your goal is to provide specific, actionable advice to cut costs and increase savings.
                
                Rules:
                1. Ground your advice in the provided data. CITE SPECIFIC NUMBERS from the history.
                2. Avoid generic platitudes like "save more". Be specific: "Cut fuel by 10%".
                3. Use a friendly but professional tone (English).
                4. Structure your response:
                   - Observation: What is the biggest issue? (Cite the trend/number)
                   - Cause: Why is this happening? (based on the breakdown)
                   - Action: What specifically should the user do?`;

                const userPrompt = `Here is my financial data:
                ${fullContext}
                
                Task: Analyze the last 3 months. Identify the #1 cost driver and give concrete recommendations.`;

                console.log("Generating Local Advice (Trends)...");
                const result = await LlmClient.getInstance().generateCompletion(systemPrompt, userPrompt);
                setAdvice(result);
            } else {
                // --- CLOUD MODE ---
                console.log("Generating Cloud Advice (Trends)...");
                // We pass the stringified history/insights as the 3rd arg
                const result = await getAIAdvice(persona, {
                    totalIncome: 0, // Not tracking income in this view yet
                    totalExpense: currentTotal,
                    topCategories: topCategories
                }, `History:\n${historyStr}\n${insightStr}`);

                setAdvice(result);
            }

        } catch (e) {
            console.error("Advice Gen Error:", e);
            setAdvice("Pole, I encountered an error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.greeting}>Habari, {persona}</Text>
                    <Text style={styles.subGreeting}>
                        {preferLocal ? "Offline Mode (Privacy)" : "Cloud Mode (Advanced)"}
                    </Text>
                </View>

                {/* Visual Toggle */}
                <TouchableOpacity
                    style={[styles.toggleContainer, preferLocal ? styles.toggleOn : styles.toggleOff]}
                    onPress={toggleSource}
                    activeOpacity={0.9}
                >
                    <View style={[styles.toggleKnob, preferLocal ? styles.knobOn : styles.knobOff]}>
                        {preferLocal ? <Zap size={14} color={colors.primary} /> : <Cloud size={14} color="white" />}
                    </View>
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={false} onRefresh={loadData} />}
            >
                {/* 1. Monthly Snapshot with Trend Indicator */}
                <View style={styles.factCard}>
                    <View style={styles.factRow}>
                        <View>
                            <Text style={styles.factLabel}>TOTAL THIS MONTH</Text>
                            <Text style={styles.factValue}>
                                KES {currentTotal.toLocaleString()}
                            </Text>
                            {/* Trend Badge */}
                            {insights.length > 0 && (
                                <View style={styles.trendBadge}>
                                    <TrendingUp size={12} color="#D32F2F" />
                                    <Text style={styles.trendText}>Review Spending</Text>
                                </View>
                            )}
                        </View>
                        <View style={styles.iconBox}>
                            <Wallet size={24} color={colors.primary} />
                        </View>
                    </View>

                    {/* Insights Preview */}
                    {insights.length > 0 ? (
                        <View style={styles.insightBox}>
                            {insights.slice(0, 2).map((insight, idx) => (
                                <Text key={idx} style={styles.insightText}>• {insight}</Text>
                            ))}
                        </View>
                    ) : (
                        <View style={styles.miniBreakdown}>
                            {breakdown.slice(0, 3).map((cat, idx) => (
                                <Text key={idx} style={styles.miniCatText}>
                                    {cat.name}: <Text style={{ fontWeight: 'bold' }}>{cat.total.toLocaleString()}</Text>
                                </Text>
                            ))}
                        </View>
                    )}
                </View>

                {/* 2. Action Button */}
                <TouchableOpacity
                    onPress={handleGetAdvice}
                    disabled={loading || currentTotal === 0}
                    activeOpacity={0.8}
                    style={styles.actionBtnWrapper}
                >
                    <LinearGradient
                        colors={preferLocal ? [colors.primary, '#004D40'] : ['#1976D2', '#0D47A1']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.actionBtn}
                    >
                        {loading ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <ActivityIndicator color="white" style={{ marginRight: 10 }} />
                                <Text style={styles.actionBtnText}>Analyzing History...</Text>
                            </View>
                        ) : (
                            <>
                                <Sparkles size={18} color="white" style={{ marginRight: 8 }} />
                                <Text style={styles.actionBtnText}>
                                    {preferLocal ? "Analyze Trends (Offline)" : "Analyze Trends (Cloud)"}
                                </Text>
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>

                {/* 3. Advice Result */}
                {advice ? (
                    <MotiView
                        from={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'timing', duration: 400 }}
                        style={styles.adviceContainer}
                    >
                        <View style={styles.adviceHeader}>
                            <ModelsIcon isLocal={preferLocal} />
                            <Text style={styles.adviceTitle}>Advisor's Perspective</Text>
                        </View>
                        <Text style={styles.adviceText}>{advice}</Text>

                        <Text style={styles.disclaimer}>
                            Based on your spending over the last 3 months.
                        </Text>
                    </MotiView>
                ) : (
                    !loading && (
                        <View style={styles.placeholder}>
                            <Text style={styles.placeholderText}>
                                Tap above to compare this month against your 3-month average.
                            </Text>
                        </View>
                    )
                )}

            </ScrollView>
        </View>
    );
};

const ModelsIcon = ({ isLocal }: { isLocal: boolean }) => (
    <View style={{
        backgroundColor: isLocal ? '#E0F2F1' : '#E3F2FD',
        padding: 8,
        borderRadius: 12,
        marginRight: 12
    }}>
        {isLocal ? <Zap size={20} color={colors.primary} /> : <Cloud size={20} color="#1976D2" />}
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F7FA',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
        paddingTop: 10,
    },
    greeting: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.text,
    },
    subGreeting: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    // Toggle
    toggleContainer: {
        width: 50,
        height: 28,
        borderRadius: 20,
        justifyContent: 'center',
        paddingHorizontal: 2,
    },
    toggleOn: {
        backgroundColor: '#E0E0E0',
    },
    toggleOff: {
        backgroundColor: '#1976D2',
    },
    toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
        elevation: 2,
    },
    knobOn: {
        backgroundColor: 'white', // Local active
        alignSelf: 'flex-start', // Left
    },
    knobOff: {
        backgroundColor: 'rgba(255,255,255,0.2)', // Cloud active (icon matches bg)
        alignSelf: 'flex-end',
    },

    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    // Snapshot
    factCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    factRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    factLabel: {
        fontSize: 11,
        color: colors.textSecondary,
        fontWeight: 'bold',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    factValue: {
        fontSize: 26,
        fontWeight: '900',
        color: colors.text,
    },
    trendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        backgroundColor: '#FFEBEE',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start'
    },
    trendText: {
        fontSize: 11,
        color: '#D32F2F',
        marginLeft: 4,
        fontWeight: '600'
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#E0F2F1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    miniBreakdown: {
        backgroundColor: '#FAFAFA',
        padding: 12,
        borderRadius: 12,
    },
    miniCatText: {
        fontSize: 13,
        color: colors.text,
        marginBottom: 4,
    },
    insightBox: {
        backgroundColor: '#FFF8E1',
        padding: 12,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#FFA000'
    },
    insightText: {
        fontSize: 13,
        color: '#5D4037',
        marginBottom: 4,
        fontWeight: '500'
    },
    // Button
    actionBtnWrapper: {
        marginBottom: 30,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 5,
    },
    actionBtn: {
        paddingVertical: 18,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Output
    adviceContainer: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    adviceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    adviceTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
    },
    adviceText: {
        fontSize: 15,
        lineHeight: 24, // Good readability
        color: '#37474F',
    },
    disclaimer: {
        marginTop: 20,
        fontSize: 11,
        color: colors.textSecondary,
        fontStyle: 'italic',
        textAlign: 'center'
    },
    placeholder: {
        alignItems: 'center',
        paddingHorizontal: 40,
        marginTop: 10
    },
    placeholderText: {
        textAlign: 'center',
        color: '#B0BEC5',
        fontSize: 14
    }
});

export default AdviceScreen;
