import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Switch, useColorScheme, StatusBar, PermissionsAndroid, Platform, Animated, Easing } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { ArrowRight, CheckCircle, Download, Cloud, Radio, Info, UserCheck, Shield, Bot, Loader2, Check } from 'lucide-react-native';
import { SettingsRepository } from '../services/settings/SettingsRepository';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { ModelManager } from '../services/llm/ModelManager';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

const SetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const { name, persona } = route.params as { name: string, persona: string } || {};
  const isDark = useColorScheme() === 'dark';
  const [preferCloud, setPreferCloud] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [completeStep, setCompleteStep] = useState<'choice' | 'success'>('choice');
  const [countdown, setCountdown] = useState(3);
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    if (completeStep === 'success') {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [completeStep]);

  useEffect(() => {
    if (completeStep === 'success' && countdown === 0) {
      handleGoToDashboard();
    }
  }, [countdown, completeStep]);



  useEffect(() => {
    // Subscribe to model download progress
    const unsubscribe = ModelManager.addListener((state) => {
      setDownloading(state.isDownloading);
      setDownloadProgress(state.progress);
    });

    // Check initial state
    ModelManager.isModelReady().then(ready => {
      if (ready) setDownloadProgress(1);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleComplete = async () => {
    try {
      const settingsRepo = new SettingsRepository();
      const expenseRepo = new ExpenseRepository();

      // Save Profile
      await settingsRepo.saveUserProfile(name || 'User', persona || 'other');

      // Save AI Preference
      await settingsRepo.setPreferLocalModelEnabled(!preferCloud);

      // Ensure Categories
      await expenseRepo.ensureCategoriesForPersona(persona || 'other');

      // Show Success View
      setCompleteStep('success');

    } catch (e) {
      console.error("Failed to save setup:", e);
    }
  };

  const handleGoToDashboard = () => {
    navigation.replace('MainTabs');
  };

  const handleDownloadModel = async () => {
    try {
      await ModelManager.downloadModel();
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  // SUCCESS VIEW
  if (completeStep === 'success') {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? colors.backgroundDark : colors.surface} />

        <View style={{ paddingTop: 60, paddingBottom: 20 }}>
          <View style={styles.progressRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <View
                key={s}
                style={[
                  styles.progressBar,
                  {
                    backgroundColor: colors.primary
                  }
                ]}
              />
            ))}
          </View>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ marginBottom: 32, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: 999, backgroundColor: 'rgba(19, 236, 91, 0.2)', transform: [{ scale: 1.5 }] }} />
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowRadius: 20, shadowOpacity: 0.3, elevation: 10 }}>
              <CheckCircle size={50} color="white" />
            </View>
          </View>

          <Text style={[styles.title, isDark && styles.textLight, { textAlign: 'center' }]}>All Set, {persona === 'mama_mboga' ? 'Mama Mboga' : (name || 'Boss')}!</Text>
          <Text style={[styles.subtitle, isDark && styles.textGray, { textAlign: 'center', maxWidth: 280, marginTop: 8 }]}>Your assistant is ready to help you track expenses and grow.</Text>

          <View style={[styles.statusCard, isDark && styles.statusCardDark]}>
            <View style={styles.statusRow}>
              <View style={[styles.statusIcon, { backgroundColor: 'rgba(22, 163, 74, 0.1)' }]}>
                <UserCheck size={18} color={isDark ? '#4ade80' : '#15803d'} />
              </View>
              <View>
                <Text style={[styles.statusTitle, isDark && styles.textLight]}>Profile Ready</Text>
                <Text style={[styles.statusDesc, isDark && styles.textGray]}>Customized for {persona}</Text>
              </View>
              <Check size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />
            </View>
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <View style={styles.statusRow}>
              <View style={[styles.statusIcon, { backgroundColor: 'rgba(22, 163, 74, 0.1)' }]}>
                <Shield size={18} color={isDark ? '#4ade80' : '#15803d'} />
              </View>
              <View>
                <Text style={[styles.statusTitle, isDark && styles.textLight]}>Permissions Set</Text>
                <Text style={[styles.statusDesc, isDark && styles.textGray]}>Secure on-device processing</Text>
              </View>
              <Check size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />
            </View>
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <View style={styles.statusRow}>
              <View style={[styles.statusIcon, { backgroundColor: 'rgba(22, 163, 74, 0.1)' }]}>
                <Bot size={18} color={isDark ? '#4ade80' : '#15803d'} />
              </View>
              <View>
                <Text style={[styles.statusTitle, isDark && styles.textLight]}>AI Configured</Text>
                <Text style={[styles.statusDesc, isDark && styles.textGray]}>{preferCloud ? 'Hybrid Cloud Mode' : 'Offline Optimized'}</Text>
              </View>
              <Check size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGoToDashboard}>
            <Text style={styles.primaryButtonText}>Go to My Dashboard</Text>
            <ArrowRight size={20} color="#0d1b12" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 }}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Loader2 size={16} color={isDark ? '#94a3b8' : '#64748b'} />
            </Animated.View>
            <Text style={{ fontSize: 13, color: isDark ? '#94a3b8' : '#64748b' }}>Starting engine in {countdown}...</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? colors.backgroundDark : colors.surface} />

      <View style={styles.header}>
        <View style={styles.progressRow}>
          {[1, 2, 3, 4, 5].map((s) => (
            <View
              key={s}
              style={[
                styles.progressBar,
                {
                  backgroundColor: s <= 4 ? colors.primary : (isDark ? '#334155' : '#e2e8f0')
                }
              ]}
            />
          ))}
        </View>
        <Text style={[styles.title, isDark && styles.textLight]}>Choose your AI</Text>
        <Text style={[styles.subtitle, isDark && styles.textGray]}>Kaikei works best when it learns from you. Select how you want the AI to operate.</Text>
      </View>

      <View style={styles.content}>
        {/* Local AI Card (Recommended) */}
        <View style={[styles.card, styles.cardRecommended, isDark && styles.cardDark]}>
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedText}>RECOMMENDED</Text>
          </View>

          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(19, 236, 91, 0.1)' }]}>
              <Download size={24} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, isDark && styles.textLight]}>Download Offline AI</Text>
              <Text style={[styles.cardDesc, isDark && styles.textGray]}>Smart features work without internet. Perfect for when you're on the move.</Text>
            </View>
          </View>

          <View style={[styles.downloadBox, isDark && styles.downloadBoxDark]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={[styles.smallText, isDark && styles.textGray]}>Qwen 2.5 (0.5B)</Text>
              <Text style={[styles.smallText, { color: colors.primary, fontWeight: 'bold' }]}>
                {downloadProgress > 0 && downloadProgress < 1 ? `${Math.round(downloadProgress * 100)}%` : (downloadProgress >= 1 ? 'Ready' : '380 MB')}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${downloadProgress * 100}%` }]} />
            </View>
          </View>

          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleDownloadModel}
            disabled={downloading || downloadProgress >= 1}
          >
            {downloadProgress >= 1 ? (
              <Text style={styles.downloadBtnText}>Downloaded</Text>
            ) : (
              <>
                <Download size={18} color={colors.primaryDark} />
                <Text style={styles.downloadBtnText}>{downloading ? "Downloading..." : "Download Now"}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Cloud AI Card */}
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(33, 150, 243, 0.1)' }]}>
              <Cloud size={20} color="#2196F3" />
            </View>
            <Text style={[styles.cardTitle, isDark && styles.textLight, { flex: 1 }]}>Enhanced Cloud AI</Text>
            <Switch
              value={preferCloud}
              onValueChange={setPreferCloud}
              trackColor={{ false: '#e2e8f0', true: colors.primary }}
              thumbColor={'white'}
            />
          </View>

          {preferCloud && (
            <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                <Info size={16} color="#2563EB" />
                <Text style={styles.infoTitle}>PRIVACY NOTE</Text>
              </View>
              <Text style={[styles.infoText, isDark && styles.textGray]}>
                Enabling this sends <Text style={{ fontWeight: 'bold', color: isDark ? 'white' : '#0f172a' }}>anonymized data</Text> to the cloud for richer insights. Your personal details stay on your device.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleComplete}>
          <Text style={styles.primaryButtonText}>Complete Setup</Text>
          <CheckCircle size={20} color="#0d1b12" />
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16 }}>
          <Text style={[styles.linkText, isDark && styles.textGray]}>
            You can change these settings later in <Text style={{ textDecorationLine: 'underline', color: isDark ? 'white' : 'black' }}>Preferences</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SetupScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 24, justifyContent: 'space-between' },
  containerDark: { backgroundColor: colors.backgroundDark },

  header: { paddingTop: 60 },
  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  progressBar: { flex: 1, height: 4, borderRadius: 99, backgroundColor: '#e2e8f0' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#0d1b12', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#475569', lineHeight: 24 },

  content: { flex: 1, paddingVertical: 24, gap: 24 },

  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardDark: { backgroundColor: colors.surfaceDark, borderColor: 'rgba(255,255,255,0.1)' },
  cardRecommended: { borderColor: 'rgba(19, 236, 91, 0.3)', position: 'relative', overflow: 'hidden' },

  recommendedBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 4, borderBottomLeftRadius: 12 },
  recommendedText: { fontSize: 10, fontWeight: 'bold', color: '#0d1b12', letterSpacing: 0.5 },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  iconBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#0d1b12', marginBottom: 4 },
  cardDesc: { fontSize: 14, color: '#64748b', lineHeight: 20 },

  downloadBox: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 16, marginBottom: 16 },
  downloadBoxDark: { backgroundColor: 'rgba(0,0,0,0.2)' },
  smallText: { fontSize: 12, color: '#64748b' },
  progressTrack: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary },

  downloadBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, backgroundColor: 'transparent' },
  downloadBtnText: { color: colors.primaryDark, fontWeight: '700', fontSize: 14 },

  infoBox: { backgroundColor: 'rgba(37, 99, 235, 0.1)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.2)' },
  infoBoxDark: { backgroundColor: 'rgba(37, 99, 235, 0.1)', borderColor: 'rgba(37, 99, 235, 0.2)' },
  infoTitle: { fontSize: 12, fontWeight: 'bold', color: '#2563EB' },
  infoText: { fontSize: 14, color: '#334155', lineHeight: 20 },

  footer: { paddingBottom: 40 },
  primaryButton: { flexDirection: 'row', height: 56, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  primaryButtonText: { fontSize: 18, fontWeight: 'bold', color: '#0d1b12' },
  linkText: { textAlign: 'center', fontSize: 12, color: '#94a3b8' },

  textLight: { color: 'white' },
  textGray: { color: '#94a3b8' },

  // Success View
  statusCard: { width: '100%', maxWidth: 340, backgroundColor: 'white', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#f1f5f9', marginTop: 32, gap: 16 },
  statusCardDark: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '600', color: '#0d1b12' },
  statusDesc: { fontSize: 12, color: '#64748b' },
  divider: { height: 1, backgroundColor: '#f1f5f9', width: '100%' },
  dividerDark: { backgroundColor: 'rgba(255,255,255,0.1)' },
});
