import React, { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
    ScrollView, Platform, RefreshControl, Alert, LayoutAnimation, UIManager
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenHeader } from '../components/ScreenHeader';
import { ModelManager } from '../services/llm/ModelManager';
import { LlmClient } from '../services/llm/LlmClient';
import { getStructuredAIAdvice } from '../services/llm/HuggingFaceService';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { SettingsRepository } from '../services/settings/SettingsRepository';
import { colors } from '../theme/colors';
import { Zap, Cloud, Wallet, Sparkles, TrendingUp, ArrowRight } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { MotiView } from 'moti';

if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

interface Citation {
    type: 'category' | 'transaction';
    id: string; // Category Name or Tx ID
    label: string;
}

const AdviceScreen = () => {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>(); // Simple any for now

    // State
    const [adviceText, setAdviceText] = useState<string>('');
    const [citations, setCitations] = useState<Citation[]>([]);
    const [loading, setLoading] = useState(false);

    // Data Context
    const [currentTotal, setCurrentTotal] = useState(0);
    const [breakdown, setBreakdown] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [insights, setInsights] = useState<string[]>([]);
    const [topTransactions, setTopTransactions] = useState<any[]>([]);

    // User Settings
    const [persona, setPersona] = useState('User');
    const [preferLocal, setPreferLocal] = useState(false);
    const [isModelReady, setIsModelReady] = useState(false);

    const repo = new ExpenseRepository();
    const settingsRepo = new SettingsRepository();

    const loadData = async () => {
        try {
            const userSettings = await settingsRepo.getUserSettings();
            setPersona(userSettings.userPersona);

            const prefer = await settingsRepo.isPreferLocalModelEnabled();
            const ready = await ModelManager.isModelReady();
            setPreferLocal(prefer);
            setIsModelReady(ready);

            const context = await repo.getAdviceContext();
            setCurrentTotal(context.currentMonth.total);
            setBreakdown(context.currentMonth.breakdown);
            setHistory(context.history);
            setInsights(context.insights);
            setTopTransactions(context.topTransactions);

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
        setAdviceText('');
        setCitations([]);
        await settingsRepo.setPreferLocalModelEnabled(newVal);
    };

    const handleGetAdvice = async () => {
        if (currentTotal === 0 && breakdown.length === 0) {
            Alert.alert("No Data", "Track some expenses first!");
            return;
        }

        setLoading(true);
        setAdviceText('');
        setCitations([]);

        try {
            const breakdownStr = breakdown.map(c => `- ${c.name}: KES ${c.total.toLocaleString()}`).join('\n');
            const historyStr = history.map(h => `- ${h.month}: KES ${h.total.toLocaleString()}`).join('\n');
            const insightStr = insights.length > 0 ? "Key Insights:\n" + insights.map(i => `- ${i}`).join('\n') : "";

            const topTxStr = topTransactions.length > 0 ? "Largest Transactions this month:\n" + topTransactions.map(t => `- KES ${t.amount.toLocaleString()} on ${t.date} for ${t.description}`).join('\n') : "";

            const fullContext = `
            Current Month Total: KES ${currentTotal.toLocaleString()}
            
            Category Breakdown:
            ${breakdownStr}
            
            Last 3 Months History:
            ${historyStr}
            
            ${topTxStr}
            
            ${insightStr}
            `;

            const userPrompt = `
                ACT AS A STRATEGIC FINANCIAL ANALYST.
                
                ## DATA CONTEXT:
                ${fullContext}
                
                ## YOUR TASK:
                1. Identify my #1 cost driver this month compared to my 3-month average.
                2. Provide concrete, actionable advice to reduce this cost specifically for my role as a ${persona}.
                3. Be extremely specific: include predicted savings in KES (e.g., "Changing X could save ~KES 1,200 next month").
                
                ## PERSONA-SPECIFIC CHECKS:
                - If I am a Mama Mboga: Look for stock turnover patterns and suggest ways to reduce perishable-stock losses or transport costs.
                - If I am a Bodaboda Rider: Analyze Fuel vs. Maintenance vs. Loan/Hire-Purchase payments. Suggest maintenance schedules or fuel saving routes.
                - If I am a Mochi: Look for material costs (leather, glue, soles) and advise on bulk sourcing vs. repair pricing.
                
                ## TRANSPARENCY RULE:
                Every suggestion must be grounded in the data above. If you tell me to save on Fuel, you MUST cite the 'Fuel' category.
                `;

            if (preferLocal) {
                // --- LOCAL MODE (Structured) ---
                if (!isModelReady) {
                    Alert.alert("Error", "Local model is missing.");
                    setLoading(false);
                    return;
                }

                console.log("Generating Structured Advice...");
                const result = await LlmClient.getInstance().generateStructuredAdvice(persona, userPrompt);

                if (result.advice) {
                    setAdviceText(result.advice);
                }
                if (result.citations && Array.isArray(result.citations)) {
                    setCitations(result.citations);
                }

            } else {
                // --- CLOUD MODE (Structured) ---
                console.log("Generating Cloud Structured Advice...");
                const result = await getStructuredAIAdvice(persona, userPrompt);

                if (result.advice) {
                    setAdviceText(result.advice);
                }
                if (result.citations && Array.isArray(result.citations)) {
                    setCitations(result.citations);
                }
            }

        } catch (e) {
            console.error("Advice Gen Error:", e);
            setAdviceText("Pole, I encountered an error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleCitationPress = (citation: Citation) => {
        if (citation.type === 'category') {
            // Navigate to Analytics (Month View) - passing params if supported later
            // For now, just go to analytics. Ideally, we pass { focusCategory: citation.id }
            navigation.navigate('Analytics', { focusCategory: citation.id });
        } else {
            Alert.alert("Evidence", `Transaction ID: ${citation.id}`);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.greeting}>Habari, {persona}</Text>
                    <Text style={styles.subGreeting}>
                        {preferLocal ? "Offline Mode (Privacy)" : "Cloud Mode (Advanced)"}
                    </Text>
                </View>

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
                <View style={styles.factCard}>
                    <View style={styles.factRow}>
                        <View>
                            <Text style={styles.factLabel}>TOTAL THIS MONTH</Text>
                            <Text style={styles.factValue}>
                                KES {currentTotal.toLocaleString()}
                            </Text>
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
                </View>

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

                {adviceText ? (
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

                        {/* THE ADVICE TEXT */}
                        <Text style={styles.adviceText}>{adviceText}</Text>

                        {/* CITATION CHIPS */}
                        {citations.length > 0 && (
                            <View style={styles.citationsContainer}>
                                <Text style={styles.citationsTitle}>Evidence:</Text>
                                <View style={styles.chipsRow}>
                                    {citations.map((cite, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            style={styles.chip}
                                            onPress={() => handleCitationPress(cite)}
                                        >
                                            <Text style={styles.chipText}>{cite.label}</Text>
                                            <ArrowRight size={12} color={colors.primary} style={{ marginLeft: 4 }} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        <Text style={styles.disclaimer}>
                            Based on your spending over the last 3 months.
                        </Text>
                    </MotiView>
                ) : (
                    !loading && (
                        <View style={styles.placeholder}>
                            <Text style={styles.placeholderText}>
                                Tap above to see transparent, evidence-based advice.
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
        backgroundColor: 'white',
        alignSelf: 'flex-start',
    },
    knobOff: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignSelf: 'flex-end',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
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
        lineHeight: 24,
        color: '#37474F',
    },
    citationsContainer: {
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#EEEEEE'
    },
    citationsTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase'
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    chip: {
        backgroundColor: '#E0F2F1',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#B2DFDB'
    },
    chipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#00695C'
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
