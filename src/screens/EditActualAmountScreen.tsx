import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { ChevronLeft, Search } from 'lucide-react-native';

type EditActualAmountScreenRouteProp = RouteProp<RootStackParamList, 'EditActualAmount'>;
type EditActualAmountNavigationProp = NativeStackNavigationProp<RootStackParamList, 'EditActualAmount'>;

export const EditActualAmountScreen: React.FC = () => {
    const navigation = useNavigation<EditActualAmountNavigationProp>();
    const route = useRoute<EditActualAmountScreenRouteProp>();
    const { breakdownId, tagName, currentAmount, plannedAmount } = route.params;

    const [amountValue, setAmountValue] = useState(currentAmount?.toString() || '');
    const [saving, setSaving] = useState(false);

    const budgetRepo = new BudgetRepository();

    const handleSave = async () => {
        if (!amountValue.trim()) return;
        const amount = parseFloat(amountValue);
        if (isNaN(amount)) return;

        setSaving(true);
        try {
            await budgetRepo.updateBreakdownActualAmount(breakdownId, amount);
            navigation.goBack();
        } catch (e) {
            console.error("Failed to save actual amount", e);
            Alert.alert("Error", "Could not save amount.");
        } finally {
            setSaving(false);
        }
    };

    const formatKes = (amount: number) => {
        return `KES ${amount.toLocaleString()}`;
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.container}
        >
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.headerTitle}>Log Actual Amount</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
                <View style={styles.contextCard}>
                    <Text style={styles.itemName}>{tagName}</Text>
                    <View style={styles.statsRow}>
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Planned</Text>
                            <Text style={styles.statValue}>{formatKes(plannedAmount)}</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.stat}>
                            <Text style={styles.statLabel}>Current Actual</Text>
                            <Text style={styles.statValue}>{formatKes(currentAmount || 0)}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Actual Amount Spent</Text>
                    <View style={styles.amountInputRow}>
                        <Text style={styles.currency}>KES</Text>
                        <TextInput
                            style={styles.amountInput}
                            placeholder="0"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            value={amountValue}
                            onChangeText={setAmountValue}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={handleSave}
                            selectTextOnFocus
                        />
                    </View>
                </View>

                {/* Optional: Add a note or helper text here */}
                <Text style={styles.helperText}>
                    Enter the final amount spent on this item. If you have M-Pesa transactions for this, you can also use the Reconciliation screen to link them automatically.
                </Text>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={() => navigation.goBack()}
                    style={styles.cancelBtn}
                >
                    <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                    onPress={handleSave}
                    style={[
                        styles.saveBtn,
                        !amountValue.trim() && { opacity: 0.4 }
                    ]}
                    disabled={!amountValue.trim() || saving}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color="#0d1b12" />
                    ) : (
                        <Text style={styles.saveText}>Save Amount</Text>
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    body: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    contextCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    itemName: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    stat: {
        flex: 1,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: '#E2E8F0',
        marginHorizontal: 16,
    },
    field: {
        marginBottom: 24,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 8,
    },
    amountInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 16,
    },
    currency: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textSecondary,
        marginRight: 8,
    },
    amountInput: {
        flex: 1,
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
        paddingVertical: 14,
    },
    helperText: {
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 15,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    saveBtn: {
        flex: 1,
        paddingVertical: 15,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: colors.primary,
    },
    saveText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#0d1b12',
    },
});
