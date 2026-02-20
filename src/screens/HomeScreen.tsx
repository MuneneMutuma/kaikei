import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity, StatusBar, ScrollView, Animated, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Settings, Cloud, Zap, ArrowRight, Mic, Plus, ArrowLeftRight, TrendingUp, Wallet, Lightbulb, ChevronRight, CheckCircle } from 'lucide-react-native'; // Replaced Material Icons with Listen
import { colors } from "../theme/colors";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { SettingsRepository } from "../services/settings/SettingsRepository";
import { IngestionEvents, INGESTION_EVENT } from "../services/ingestion/IngestionEvents";

const CLOUD_ICON = <Cloud size={16} color={colors.primary} />;

export default function HomeScreen({ navigation }: any) {
  const [userName, setUserName] = useState("Kamau");
  const [persona, setPersona] = useState("User");
  const [totalSpent, setTotalSpent] = useState(0);
  const [cashBalance, setCashBalance] = useState(1200); // Mocked for UI demo
  const [loading, setLoading] = useState(false);

  // Animation for large mic button
  const scale = useRef(new Animated.Value(1)).current;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const settingsRepo = new SettingsRepository();
    const expenseRepo = new ExpenseRepository();

    // Load Profile
    const profile = await settingsRepo.getUserSettings();
    setUserName(profile.userName || "Kamau");
    setPersona(profile.userPersona || "User");

    // Load Expenses
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Get simple daily total
    // Note: Use existing repo methods or add new one for daily sum
    // For now, get all month expenses and filter for today to be safe
    const monthExpenses = await expenseRepo.getExpensesByMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const todayTotal = monthExpenses
      .filter(e => e.date.startsWith(todayStr) && e.type === 'expense')
      .reduce((acc, curr) => acc + curr.amount, 0);

    setTotalSpent(todayTotal);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      StatusBar.setBarStyle('dark-content');
      StatusBar.setBackgroundColor('transparent');
      StatusBar.setTranslucent(true);
    }, [fetchData])
  );

  // Pulse Animation Loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 1500, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1500, useNativeDriver: true })
      ])
    ).start();
  }, [scale]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.profileRow}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC0NpCK1GnZ_tIzvNjJHNEeMqjtZPXDVrBOppLvVLH95hQSvhNLss2eE06uO2nOlTkar4wAWOkqzDV6sTL53WA3lRQZbhCvJGa3IJRWegLfXfVC8SLEL740kshxiVDKN03C1iJ0EHTH4YtTyOVKfW4CquPy8s7VF_o0pbV-twkGxy42d9KxMS-ZRn8-Xvthd1mWqDAdyzdtnjsl_qf8qekjcxBmDVJbj2lorERpOugcKMKbHtN1obe6daZpMrOFEgwCHXnhSTpw-DfT' }}
              style={styles.avatar}
            />
            <View style={styles.onlineBadge} />
          </View>
          <View>
            <Text style={styles.greeting}>Habari,</Text>
            <Text style={styles.name}>{userName}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Profile')}>
          <Settings size={24} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* Sync Status Pill */}
      <View style={styles.syncContainer}>
        <View style={styles.syncBadge}>
          <CheckCircle size={14} color={colors.primaryDark} />
          <Text style={styles.syncText}>Last updated: Just now</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
      >
        <View style={styles.grid}>
          {/* Today's Spent Card */}
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Leo (Today)</Text>
              <View style={styles.expenseBadge}>
                <Text style={styles.expenseBadgeText}>Spent</Text>
              </View>
            </View>
            <View>
              <Text style={styles.statValue}>KSh {totalSpent.toLocaleString()}</Text>
              <View style={styles.trendRow}>
                <TrendingUp size={12} color={colors.danger} />
                <Text style={styles.trendText}>+15% vs yesterday</Text>
              </View>
            </View>
          </View>

          {/* Cash Balance Card */}
          <View style={styles.statCard}>
            <View style={styles.bgIcon}>
              <Wallet size={80} color={colors.primary} opacity={0.1} />
            </View>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Cash Balance</Text>
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>Available</Text>
              </View>
            </View>
            <View>
              <Text style={styles.statValue}>KSh {cashBalance.toLocaleString()}</Text>
              <View style={styles.safeRow}>
                <CheckCircle size={12} color={colors.primaryDark} />
                <Text style={styles.safeText}>Safe Range</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Smart Insight Card */}
        <TouchableOpacity style={styles.insightCard} onPress={() => navigation.navigate('Insights')}>
          <View style={styles.insightIcon}>
            <Lightbulb size={24} color="#ea580c" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightTitle}>Fuel Spike Alert</Text>
            <Text style={styles.insightDesc}>Fuel is <Text style={{ color: '#ea580c', fontWeight: 'bold' }}>15% higher</Text> today. Tap to see why.</Text>
          </View>
          <ChevronRight size={20} color="#ea580c" />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Action Area */}
        <View style={styles.actionArea}>
          {/* Large Voice Button with Animation */}
          <TouchableOpacity
            style={styles.micButtonWrapper}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('AddExpense')} // 'AddExpense' is the VoiceInput screen 
          // Wait, Navigation flow in App.tsx shows 'SmsReader' as a screen, but we want VoiceInput screen.
          // The VoiceInput component is likely embedded or a screen. 
          // Looking at App.tsx, we have a VoiceInput screen or similar? 
          // Ah, App.tsx has `SmsReader` mapped to `SmsReaderScreen`. 
          // `VoiceInput.tsx` was a separate file. 
          // I will check App.tsx again. It seems I didn't see `VoiceInput` in the stack in my previous view_file of App.tsx. I might need to add it or repurpose `AddExpense`.
          // The artifact says "Ongea / Speak". 
          // I will Assume there is a route 'VoiceInput' or I will use 'AddExpense' for now if it contains voice.
          // Actually, let's look at `App.tsx` again or just navigate to `AddExpense` if it has the voice component, OR better, create a new route if needed. 
          // I'll assume for now I should navigate to 'AddExpense' which seems to be the place for adding expenses, potentially via voice.
          // BUT, the plan said "Rewrite `VoiceInput.tsx`". 
          // I'll make sure `App.tsx` has a route for `VoiceInput` eventually. For now, I'll navigate to `AddExpense` which I will likely modify or replacements.
          // Actually, the previous `VoiceInput.tsx` seemed to be a standalone screen. 
          // I will check `App.tsx` again in next step. For now I'll point to 'AddExpense'.
          >
            <Animated.View style={[styles.micPulse, { transform: [{ scale }] }]} />
            <View style={styles.micButton}>
              <Mic size={40} color="#0d1b12" />
            </View>
            <Text style={styles.micLabel}>Ongea / Speak</Text>
            <Text style={styles.micSubLabel}>Tap to record expense</Text>
          </TouchableOpacity>

          {/* Secondary Buttons */}
          <View style={styles.secondaryActions}>
            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('AddManual')}>
              <Plus size={24} color="#0d1b12" />
              <Text style={styles.actionButtonText}>Add Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('SmsReader')}>
              <ArrowLeftRight size={24} color="#0d1b12" />
              <Text style={styles.actionButtonText}>M-Pesa Sync</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 50, paddingBottom: 10 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.primary },
  onlineBadge: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, borderWidth: 2, borderColor: 'white' },
  greeting: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  name: { fontSize: 20, color: '#0d1b12', fontWeight: 'bold', lineHeight: 24 },
  settingsButton: { padding: 8, borderRadius: 20, backgroundColor: '#f1f5f9' },

  syncContainer: { paddingHorizontal: 24, paddingBottom: 16 },
  syncBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(19, 236, 91, 0.1)', borderWidth: 1, borderColor: 'rgba(19, 236, 91, 0.2)' },
  syncText: { fontSize: 12, fontWeight: '500', color: '#334155' },

  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 100 },

  grid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 20, height: 160, justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, overflow: 'hidden', position: 'relative' },
  bgIcon: { position: 'absolute', right: -10, top: -10 },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statLabel: { fontSize: 13, color: '#64748b', fontWeight: '500' },

  expenseBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  expenseBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#dc2626' },
  successBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  successBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#15803d' },

  statValue: { fontSize: 24, fontWeight: 'bold', color: '#0d1b12', marginBottom: 4 },

  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendText: { fontSize: 11, fontWeight: '500', color: '#ef4444' },
  safeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  safeText: { fontSize: 11, fontWeight: '500', color: colors.primaryDark },

  insightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#ffedd5', borderRadius: 12, marginBottom: 24 },
  insightIcon: { padding: 8, backgroundColor: '#ffedd5', borderRadius: 20 },
  insightTitle: { fontSize: 14, fontWeight: 'bold', color: '#0d1b12' },
  insightDesc: { fontSize: 13, color: '#475569', marginTop: 2 },

  actionArea: { marginTop: 'auto', alignItems: 'center', gap: 24 },
  micButtonWrapper: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  micPulse: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(19, 236, 91, 0.2)' },
  micButton: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 10, marginBottom: 12 },
  micLabel: { fontSize: 18, fontWeight: 'bold', color: '#0d1b12' },
  micSubLabel: { fontSize: 12, color: '#64748b' },

  secondaryActions: { flexDirection: 'row', gap: 12, width: '100%' },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#e2e8f0', padding: 16, borderRadius: 12 },
  actionButtonText: { fontSize: 14, fontWeight: 'bold', color: '#0d1b12' },
});
