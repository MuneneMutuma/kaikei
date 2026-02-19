import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { colors } from '../theme/colors';
import { ScreenHeader } from '../components/ScreenHeader';
import { Bell, Zap, Cloud, Fuel, ArrowRight, CheckCircle, ShoppingBasket, CreditCard } from 'lucide-react-native';

const AdviceScreen = () => {
    const [mode, setMode] = useState<'local' | 'cloud'>('local');

    return (
        <View style={styles.container}>
            {/* Header */}
            <ScreenHeader
                title="Smart Advice"
                subtitle="Financial Insights"
                actionIcon={<Bell size={24} color="#15803d" />}
                showNotification={false} // Using custom action icon
            />

            {/* Toggle */}
            <View style={styles.toggleContainer}>
                <View style={styles.toggleTrack}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, mode === 'local' && styles.toggleActive]}
                        onPress={() => setMode('local')}
                    >
                        <Zap size={16} color={mode === 'local' ? '#15803d' : '#64748b'} />
                        <Text style={[styles.toggleText, mode === 'local' && styles.toggleTextActive]}>Local AI (Fast)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, mode === 'cloud' && styles.toggleActive]}
                        onPress={() => setMode('cloud')}
                    >
                        <Cloud size={16} color={mode === 'cloud' ? '#0d1b12' : '#64748b'} />
                        <Text style={[styles.toggleText, mode === 'cloud' && styles.toggleTextActive]}>Cloud AI (Deep)</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.toggleHint}>Local mode works offline. Switch to Cloud for deep market analysis.</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Fuel Card (High Priority) */}
                <View style={[styles.card, styles.highPriorityCard]}>
                    <View style={styles.cardLeftBorder} />
                    <View style={styles.cardBody}>
                        <View style={styles.cardHeader}>
                            <View style={styles.tagRow}>
                                <View style={[styles.iconBox, { backgroundColor: '#fef2f2' }]}>
                                    <Fuel size={16} color="#dc2626" />
                                </View>
                                <Text style={styles.priorityTag}>HIGH PRIORITY</Text>
                            </View>
                            <Text style={styles.timestamp}>Just now</Text>
                        </View>

                        <Text style={styles.cardMainTitle}>
                            Save <Text style={{ color: '#16a34a' }}>KES 1,200</Text> on Fuel
                        </Text>
                        <Text style={styles.cardText}>
                            Fuel is <Text style={{ fontWeight: 'bold', color: '#dc2626' }}>31% above</Text> your weekly average.
                        </Text>

                        {/* Evidence */}
                        <TouchableOpacity style={styles.evidenceBtn}>
                            <Text style={styles.evidenceText}>Evidence: 4 recent trips</Text>
                            <ArrowRight size={14} color="#64748b" />
                        </TouchableOpacity>

                        {/* AI Suggestion */}
                        <View style={styles.aiBox}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <Zap size={16} color="#15803d" />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.aiTitle}>AI Suggestion</Text>
                                    <Text style={styles.aiText}>
                                        Refuel at <Text style={{ fontWeight: 'bold' }}>Shell Limuru Rd</Text> on Tuesday mornings. Off-peak rates are lower.
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.actionBtn}>
                            <CheckCircle size={18} color="#0d1b12" />
                            <Text style={styles.actionBtnText}>I did this</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Stock Card */}
                <View style={styles.card}>
                    <View style={styles.cardBody}>
                        <View style={styles.cardHeader}>
                            <View style={styles.tagRow}>
                                <View style={[styles.iconBox, { backgroundColor: '#eff6ff' }]}>
                                    <ShoppingBasket size={16} color="#2563EB" />
                                </View>
                                <Text style={[styles.priorityTag, { color: '#2563EB' }]}>OPPORTUNITY</Text>
                            </View>
                            <Text style={styles.timestamp}>2h ago</Text>
                        </View>

                        <Text style={styles.cardMainTitle}>Restock Tomatoes Today</Text>
                        <Text style={styles.cardText}>
                            Marikiti Market prices dropped by <Text style={{ color: '#16a34a', fontWeight: 'bold' }}>15%</Text> this morning.
                        </Text>

                        <View style={styles.mpesaRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={styles.mpesaIcon} />
                                <Text style={styles.mpesaText}>Pay supplier directly</Text>
                            </View>
                            <TouchableOpacity>
                                <Text style={styles.payLink}>Pay Now</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Loan Card - Opacity reduced */}
                <View style={[styles.card, { opacity: 0.9 }]}>
                    <View style={styles.cardBody}>
                        <View style={styles.cardHeader}>
                            <View style={styles.tagRow}>
                                <View style={[styles.iconBox, { backgroundColor: '#faf5ff' }]}>
                                    <CreditCard size={16} color="#9333ea" />
                                </View>
                                <Text style={[styles.priorityTag, { color: '#9333ea' }]}>CREDIT HEALTH</Text>
                            </View>
                        </View>

                        <Text style={[styles.cardMainTitle, { fontSize: 16 }]}>Loan limit increased!</Text>
                        <Text style={styles.cardText}>Your timely repayments have unlocked a new limit of KES 5,000.</Text>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(246, 248, 246, 0.9)' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#0d1b12' },
    notifBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(19, 236, 91, 0.2)', alignItems: 'center', justifyContent: 'center' },

    toggleContainer: { paddingHorizontal: 24, paddingBottom: 24 },
    toggleTrack: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4 },
    toggleBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, gap: 8, borderRadius: 8 },
    toggleActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    toggleText: { fontSize: 13, fontWeight: '500', color: '#64748b' },
    toggleTextActive: { color: '#0d1b12', fontWeight: '600' },
    toggleHint: { textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 12 },

    scrollContent: { paddingHorizontal: 20, gap: 24, paddingBottom: 100 },

    card: { backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 },
    highPriorityCard: {},
    cardBody: { padding: 20 },
    cardLeftBorder: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 6, backgroundColor: colors.primary },

    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBox: { padding: 8, borderRadius: 8 },
    priorityTag: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1, color: '#dc2626' },
    timestamp: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },

    cardMainTitle: { fontSize: 20, fontWeight: 'bold', color: '#0d1b12', marginBottom: 6 },
    cardText: { fontSize: 15, color: '#475569', lineHeight: 22 },

    evidenceBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start', marginTop: 12, marginBottom: 16 },
    evidenceText: { fontSize: 12, fontWeight: '500', color: '#334155' },

    aiBox: { backgroundColor: 'rgba(19, 236, 91, 0.1)', padding: 16, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(19, 236, 91, 0.2)' },
    aiTitle: { fontSize: 13, fontWeight: 'bold', color: '#0d1b12', marginBottom: 2 },
    aiText: { fontSize: 13, color: '#334155', lineHeight: 18 },

    actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 8, elevation: 2 },
    actionBtnText: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },

    mpesaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    mpesaIcon: { width: 32, height: 20, backgroundColor: '#EB001B', borderRadius: 4 }, // Mock
    mpesaText: { fontSize: 12, color: '#64748b' },
    payLink: { fontSize: 14, fontWeight: 'bold', color: colors.primaryDark },
});

export default AdviceScreen;
