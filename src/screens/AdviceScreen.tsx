import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { getAIAdvice } from '../services/llm/HuggingFaceService';

const AdviceScreen = () => {
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

    return (
        <View style={styles.container}>
            <Text style={styles.title}>AI Financial Advisor</Text>
            <Text style={styles.subtitle}>Powered by HuggingFace (Qwen 2.5)</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Current Status (Mock)</Text>
                <Text style={styles.cardBody}>Fuel: 5,000 | Meals: 2,000 | Repairs: 1,500</Text>
            </View>

            <TouchableOpacity
                style={styles.button}
                onPress={handleGetAdvice}
                disabled={loading}
            >
                <Text style={styles.buttonText}>
                    {loading ? "Thinking..." : "Pata Ushauri (Get Advice)"}
                </Text>
            </TouchableOpacity>

            {loading && <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 20 }} />}

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
    container: { flex: 1, padding: 20, backgroundColor: '#F5F7FA' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
    card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 20 },
    cardTitle: { fontWeight: 'bold', marginBottom: 5 },
    cardBody: { color: '#555' },
    button: { backgroundColor: '#2196F3', padding: 15, borderRadius: 10, alignItems: 'center' },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    resultContainer: { marginTop: 20, backgroundColor: '#E3F2FD', padding: 15, borderRadius: 10, flex: 1 },
    resultTitle: { fontWeight: 'bold', fontSize: 18, marginBottom: 10, color: '#1565C0' },
    resultText: { fontSize: 16, lineHeight: 24, color: '#333' }
});

export default AdviceScreen;
