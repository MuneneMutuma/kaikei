import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { getAIAdvice } from '../services/llm/HuggingFaceService';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const AdviceScreen = () => {
    const insets = useSafeAreaInsets();
    const [advice, setAdvice] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGetAdvice = async () => {
        setLoading(true);
        setAdvice('');
        // Mock data based on your "unified ledger" requirement
        // In a real app, we would fetch this from ExpenseRepository
        const mockStats = "Fuel: KES 5,000, Meals: KES 2,000, Repairs: KES 1,500. Total Income: KES 15,000.";

        // Hardcoded persona for testing - in future we get from SetupScreen/Storage
        const result = await getAIAdvice('bodaboda', mockStats);
        setAdvice(result);
        setLoading(false);
    };

    // Remove top padding from container since ScreenHeader handles it, or keep it 0 if ScreenHeader has padding
    // ScreenHeader adds insets.top + 10. So we can remove paddingTop from here.

    return (
        <View style={[styles.container, { paddingBottom: 120 }]}>
            <ScreenHeader
                title="AI Financial Advisor"
                subtitle="Powered by HuggingFace"
                showNotification={false}
            />

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Current Status</Text>
                <Text style={styles.cardBody}>Fuel: 5,000 | Meals: 2,000 | Repairs: 1,500</Text>
            </View>

            <TouchableOpacity
                style={styles.button}
                onPress={handleGetAdvice}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text style={styles.buttonText}>Pata Ushauri (Get Advice)</Text>
                )}
            </TouchableOpacity>

            {advice ? (
                <ScrollView style={styles.resultContainer}>
                    <Text style={styles.resultTitle}>💡 Ushauri:</Text>
                    <Text style={styles.resultText}>{advice}</Text>
                </ScrollView>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: colors.background
    },
    title: {
        ...typography.header,
        color: colors.text,
        marginBottom: 4
    },
    subtitle: {
        ...typography.caption,
        color: colors.textSecondary,
        marginBottom: 24
    },
    card: {
        backgroundColor: colors.surface,
        padding: 16,
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
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase'
    },
    cardBody: {
        ...typography.body,
        fontSize: 16,
        color: colors.text,
        fontWeight: '600'
    },
    button: {
        backgroundColor: colors.primary,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16
    },
    resultContainer: {
        marginTop: 24,
        backgroundColor: 'white',
        padding: 20,
        borderRadius: 16,
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border
    },
    resultTitle: {
        ...typography.subHeader,
        color: colors.primary,
        marginBottom: 12
    },
    resultText: {
        ...typography.body,
        color: colors.text,
        lineHeight: 24
    }
});

export default AdviceScreen;
