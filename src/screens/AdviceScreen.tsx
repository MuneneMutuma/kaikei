import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader } from '../components/ScreenHeader';
import { getAIAdvice } from '../services/llm/HuggingFaceService';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { SettingsRepository } from '../services/settings/SettingsRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const AdviceScreen = () => {
    const insets = useSafeAreaInsets();
    const [advice, setAdvice] = useState('');
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState<{ totalIncome: number, totalExpense: number, topCategories: { name: string, amount: number }[] } | null>(null);
    const [persona, setPersona] = useState('User');

    const repo = new ExpenseRepository();
    const settingsRepo = new SettingsRepository();

    const loadData = async () => {
        try {
            // 1. Get Persona
            const userSettings = await settingsRepo.getUserSettings();
            setPersona(userSettings.userPersona);

            // 2. Get Stats for Current Month
            const now = new Date();
            const stats = await repo.getFinancialSummary(now.getMonth() + 1, now.getFullYear());
            setSummary(stats);

        } catch (e) {
            console.error("Failed to load advice context:", e);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const handleGetAdvice = async () => {
        if (!summary) return;
        setLoading(true);
        setAdvice('');

        try {
            const result = await getAIAdvice(persona, summary);
            setAdvice(result);
        } catch (e) {
            setAdvice("Failed to get advice. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { paddingBottom: 110 }]}>
            <ScreenHeader
                title="AI Financial Advisor"
                subtitle={`Personalized for ${persona}`}
                showNotification={false}
            />

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10 }}
                refreshControl={<RefreshControl refreshing={false} onRefresh={loadData} />}
            >
                {/* Status Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Current Month Status</Text>
                    {summary ? (
                        <View>
                            <Text style={styles.statRow}>
                                <Text style={styles.statLabel}>Total Spent: </Text>
                                <Text style={styles.statValue}>KES {summary.totalExpense.toLocaleString()}</Text>
                            </Text>
                            <View style={styles.divider} />
                            <Text style={styles.cardTitle}>Top Expenses</Text>
                            {summary.topCategories.length > 0 ? (
                                summary.topCategories.map((c, i) => (
                                    <Text key={i} style={styles.statRow}>
                                        <Text style={styles.statLabel}>• {c.name}: </Text>
                                        <Text style={styles.statValue}>KES {c.amount.toLocaleString()}</Text>
                                    </Text>
                                ))
                            ) : (
                                <Text style={styles.emptyText}>No expenses yet.</Text>
                            )}
                        </View>
                    ) : (
                        <ActivityIndicator color={colors.primary} />
                    )}
                </View>

                {/* Advice Button */}
                <TouchableOpacity
                    style={[styles.button, (!summary || summary.totalExpense === 0) && styles.disabledBtn]}
                    onPress={handleGetAdvice}
                    disabled={loading || !summary || summary.totalExpense === 0}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.buttonText}>Pata Ushauri (Get Advice)</Text>
                    )}
                </TouchableOpacity>

                {/* AI Result */}
                {advice ? (
                    <View style={styles.resultContainer}>
                        <Text style={styles.resultTitle}>💡 Ushauri ({persona} Edition):</Text>
                        <Text style={styles.resultText}>{advice}</Text>
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background
    },
    card: {
        backgroundColor: colors.surface,
        padding: 20,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.primary,
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2
    },
    cardTitle: {
        ...typography.subHeader,
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    statRow: {
        marginBottom: 6,
        fontSize: 15,
        color: colors.text
    },
    statLabel: {
        color: colors.textSecondary,
    },
    statValue: {
        fontWeight: 'bold',
        color: colors.text
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 12
    },
    emptyText: {
        fontStyle: 'italic',
        color: colors.textSecondary
    },
    button: {
        backgroundColor: colors.primary,
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4
    },
    disabledBtn: {
        backgroundColor: '#CFD8DC',
        shadowOpacity: 0,
        elevation: 0
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16
    },
    resultContainer: {
        marginTop: 24,
        backgroundColor: 'white',
        padding: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,105,92,0.1)', // Subtle green border
        marginBottom: 40
    },
    resultTitle: {
        ...typography.subHeader,
        color: colors.primary,
        marginBottom: 16
    },
    resultText: {
        ...typography.body,
        color: colors.text,
        lineHeight: 26,
        fontSize: 15
    }
});

export default AdviceScreen;
