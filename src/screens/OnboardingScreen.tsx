import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions, ScrollView, TextInput, useColorScheme } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { ArrowRight, Check, Store, ChevronRight, Languages, MessageSquare, Mic, Bell, ShieldCheck } from 'lucide-react-native';
import { PermissionsAndroid, Platform, Alert } from 'react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const { width } = Dimensions.get('window');

const PERSONAS = [
  {
    id: 'mama_mboga',
    title: 'Mama Mboga',
    subtitle: 'Vegetable Vendor',
    bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuByDXjkPx6VlUYiIJFhw4L9C7sicfZIsxd9yJx-3ge0Xzyo3JJBmTWR2GFElQVXaQcyaTUmmT_L6b6hVc2242NtJPVNxh6BjhIpm5snPYwxXH5D-4oWSoj6o5GWoRLsHk57FPQR_qNuMpDxeWIrkHX7AAw2mXKFrN6QABY8y4Stovhbv1NipSK4ZU-ya4_l15obSgP2WOQ-TKuLTFyOTNBb9XQxlo-9luxytczlHLTTBPAmPQSOnXk7Bt327hO2wL29roHvh2kzI5JB'
  },
  {
    id: 'bodaboda',
    title: 'Bodaboda Rider',
    subtitle: 'Motorcycle Taxi',
    bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDTTTzYQdEJZS433ugIQeZ-73eGSwKmn2ZUSXiCFJnBeeI9Nou9vblZOzvoH4DVX5tyBiWmcRHKguWqtNGW7eefAmf4yli14Ikn4htkchtdBURiqsOntZlDZBzkheNXC9VExOeDRT51kqfV4c-2m6M4u-0AENNhXSnPd3K-9PjZprLT9eAO4sOdnp_jtlTEmF0G1U-DGCMBIJjuHFGoZO7dLbEDqxkdrBCdNS6gOduGh50XK-Jx0XGTNJ9rFQCHvi3B1KwUkADD32zE'
  },
  {
    id: 'mochi',
    title: 'Mochi',
    subtitle: 'Shoemaker & Repair',
    bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBgdiuQM3Vl0T28Yvo1kt1TVwpB4_4V4AYHKisnPL3tsNzAQ6pv56AFP6pii9T7oeFZDmfSkyuWKlmE0hjtx6-z2b2xaCgmxNeNx3yCde1fuqS6gPSOFgnyt25If_qHxxb7zlQDFKk-9vTS9X9kVF7kNQdRgetcrHZzSCcVHtQ2fDzZL5UhniGpipTJHWeQCPc4NuMJH4Z8SFqbbkvIEInjZBY4e2rrFp5xXrWMt-X6frkuBXcEzwHh7jj3B2nffG0PYEvF_XhemGxQ'
  },
];

const PermissionCard = ({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  desc,
  granted,
  onPress,
  isDark
}: any) => (
  <View style={[styles.permissionCard, isDark && styles.permissionCardDark, granted && { borderColor: colors.primary }]}>
    <View style={styles.permissionHeader}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
          <Icon size={20} color={iconColor} />
        </View>
        <View>
          <Text style={[styles.permTitle, isDark && styles.textLight]}>{title}</Text>
          <Text style={[styles.permDesc, isDark && styles.textGray]}>{desc}</Text>
        </View>
      </View>
      {granted ? (
        <View style={styles.grantedBadge}>
          <Check size={14} color={colors.primaryDark} />
          <Text style={styles.grantedText}>Granted</Text>
        </View>
      ) : (
        <TouchableOpacity style={[styles.allowBtn, isDark && styles.allowBtnDark]} onPress={onPress}>
          <Text style={[styles.allowBtnText, isDark && styles.textLight]}>Allow</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);



const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  // ... (state remains valid)
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [smsGranted, setSmsGranted] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);

  const isDark = useColorScheme() === 'dark';

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (name && selectedPersona) {
        setStep(3);
      }
    } else if (step === 3) {
      navigation.navigate('Setup', { name, persona: selectedPersona! });
    }
  };

  const requestPermission = async (type: 'sms' | 'audio' | 'notification') => {
    if (Platform.OS !== 'android') return;

    try {
      if (type === 'sms') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_SMS,
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS
        ]);
        if (granted['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED) {
          setSmsGranted(true);
        }
      } else if (type === 'audio') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          setMicGranted(true);
        }
      } else if (type === 'notification') {
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            setNotifGranted(true);
          }
        } else {
          setNotifGranted(true);
        }
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const renderProgressBar = (currentStep: number) => {
    return (
      <View style={styles.progressRow}>
        {[1, 2, 3, 4, 5].map((s) => (
          <View
            key={s}
            style={[
              styles.progressBar,
              {
                backgroundColor: s <= currentStep ? colors.primary : (isDark ? '#334155' : '#e2e8f0')
              }
            ]}
          />
        ))}
      </View>
    );
  };

  // STEP 1: Welcome Splash
  if (step === 1) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>

        <View style={styles.header}>
          {renderProgressBar(1)}
          <View style={{ alignItems: 'flex-end', marginTop: 16 }}>
            <TouchableOpacity style={[styles.langButton, isDark && styles.langButtonDark]}>
              <Languages size={16} color={isDark ? '#e2e8f0' : '#475569'} />
              <Text style={[styles.langText, isDark && styles.textLight]}>ENG / SW</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.contentCenter}>
          <View style={styles.imageContainer}>
            {/* Decorative Background Blur */}
            <View style={styles.blurBg} />

            {/* Main Image Card */}
            <View style={styles.mainImageCard}>
              <Image
                source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuByDXjkPx6VlUYiIJFhw4L9C7sicfZIsxd9yJx-3ge0Xzyo3JJBmTWR2GFElQVXaQcyaTUmmT_L6b6hVc2242NtJPVNxh6BjhIpm5snPYwxXH5D-4oWSoj6o5GWoRLsHk57FPQR_qNuMpDxeWIrkHX7AAw2mXKFrN6QABY8y4Stovhbv1NipSK4ZU-ya4_l15obSgP2WOQ-TKuLTFyOTNBb9XQxlo-9luxytczlHLTTBPAmPQSOnXk7Bt327hO2wL29roHvh2kzI5JB' }}
                style={styles.image}
              />
              <View style={styles.imageOverlay} />
            </View>

            {/* Floating Elements */}
            <View style={styles.floatingCard1}>
              <Image
                source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDTTTzYQdEJZS433ugIQeZ-73eGSwKmn2ZUSXiCFJnBeeI9Nou9vblZOzvoH4DVX5tyBiWmcRHKguWqtNGW7eefAmf4yli14Ikn4htkchtdBURiqsOntZlDZBzkheNXC9VExOeDRT51kqfV4c-2m6M4u-0AENNhXSnPd3K-9PjZprLT9eAO4sOdnp_jtlTEmF0G1U-DGCMBIJjuHFGoZO7dLbEDqxkdrBCdNS6gOduGh50XK-Jx0XGTNJ9rFQCHvi3B1KwUkADD32zE' }}
                style={styles.image}
              />
            </View>

            <View style={[styles.floatingIcon, isDark && styles.floatingIconDark]}>
              <Image
                source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAK6BEiYmElHlkqf6unAd6-uC6y7_B468bktN7klEBVCJDEE9mCkn_mXavncHzyC-bYYCCA87jftlJtdP7ryTEq1Ol3gL1f7fDwf3yEPOFoijJeFNVYN9cKHLBlZQr1qVXUSdd5-1bO52CR3yyB4PdU6QBQQYLb-EjNeslnkgS4oQ-SIdVQGxPTlP91zY2hytC5bfuuvggcVwqFq47f0snIiCoEXjZBD9kUVBtWSfrpAzSNchPD3ZIyD6NJdY-2wmxyV6oNN3EmWWZQ' }}
                style={{ width: 48, height: 48, resizeMode: 'contain' }}
              />
            </View>
          </View>

          <View style={styles.textBlock}>
            <Text style={[styles.title, isDark && styles.textLight]}>
              Kaikei: Your Smart{'\n'}
              <Text style={{ color: colors.primary }}>Business Partner</Text>
            </Text>
            <Text style={[styles.subtitle, isDark && styles.textGray]}>
              Track expenses, manage cash, and get AI advice—all in one place.
            </Text>
            <Text style={[styles.caption, isDark && styles.textGray]}>
              Works offline and securely with M-Pesa.
            </Text>
            <Text style={styles.quote}>"Simu yako, biashara yako."</Text>
          </View>
        </View>

        <View style={styles.footer}>


          <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
            <Text style={styles.primaryButtonText}>Continue</Text>
            <ArrowRight color="#0d1b12" size={20} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // STEP 2: Personal Details & Persona
  if (step === 2) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.headerLeft}>
          {renderProgressBar(2)}
          <Text style={[styles.stepTitle, isDark && styles.textLight]}>Let's set you up</Text>
          <Text style={[styles.stepSubtitle, isDark && styles.textGray]}>Tell us a bit about yourself and your business.</Text>
        </View>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textLight]}>What is your name?</Text>
            <View style={styles.textInputWrapper}>
              <TextInput
                style={[styles.textInput, isDark && styles.textInputDark]}
                placeholder="e.g. John Kamau"
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={name}
                onChangeText={setName}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.textLight]}>Choose your business</Text>
            <View style={styles.personaGrid}>
              {PERSONAS.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.personaCard,
                    isDark && styles.personaCardDark,
                    selectedPersona === p.id && styles.personaCardSelected
                  ]}
                  onPress={() => setSelectedPersona(p.id)}
                >
                  <Image source={{ uri: p.bgImage }} style={styles.personaImage} />
                  <View style={styles.personaContent}>
                    <Text style={[styles.personaTitle, isDark && styles.textLight, selectedPersona === p.id && { color: colors.primaryDark }]}>{p.title}</Text>
                    <Text style={[styles.personaSubtitle, isDark && styles.textGray]}>{p.subtitle}</Text>
                  </View>
                  <View style={[styles.checkbox, selectedPersona === p.id && styles.checkboxSelected]}>
                    {selectedPersona === p.id && <Check size={14} color="white" />}
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[
                  styles.personaCard,
                  isDark && styles.personaCardDark,
                  selectedPersona === 'other' && styles.personaCardSelected
                ]}
                onPress={() => setSelectedPersona('other')}
              >
                <View style={[styles.personaImagePlaceholder, isDark && { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                  <Store size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                </View>
                <View style={styles.personaContent}>
                  <Text style={[styles.personaTitle, isDark && styles.textLight, selectedPersona === 'other' && { color: colors.primaryDark }]}>Other</Text>
                  <Text style={[styles.personaSubtitle, isDark && styles.textGray]}>General Business</Text>
                </View>
                <View style={[styles.checkbox, selectedPersona === 'other' && styles.checkboxSelected]}>
                  {selectedPersona === 'other' && <Check size={14} color="white" />}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: 40 }]}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (!name || !selectedPersona) && styles.disabledButton
            ]}
            onPress={handleNext}
            disabled={!name || !selectedPersona}
          >
            <Text style={[styles.primaryButtonText, (!name || !selectedPersona) && styles.disabledText]}>Next</Text>
            <ArrowRight color={(!name || !selectedPersona) ? "#94a3b8" : "#0d1b12"} size={20} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // STEP 3: Permissions
  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.headerLeft}>
        {renderProgressBar(3)}
        <Text style={[styles.stepTitle, isDark && styles.textLight]}>Setup Permissions</Text>
        <Text style={[styles.stepSubtitle, isDark && styles.textGray]}>To help you manage your business better, Kaikei needs access to a few things.</Text>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 16 }}>

          <PermissionCard
            icon={MessageSquare}
            iconColor="#2563EB"
            iconBg="#DBEAFE"
            title="M-Pesa SMS"
            desc="Required for tracking"
            granted={smsGranted}
            onPress={() => requestPermission('sms')}
            isDark={isDark}
          />
          <View style={styles.whyBox}>
            <Text style={[styles.whyText, isDark && styles.textGray]}>
              We read your M-Pesa SMS messages to automatically record your sales and expenses. This happens securely on your device.
            </Text>
          </View>

          <PermissionCard
            icon={Mic}
            iconColor="#9333EA"
            iconBg="#F3E8FF"
            title="Microphone"
            desc="For voice commands"
            granted={micGranted}
            onPress={() => requestPermission('audio')}
            isDark={isDark}
          />
          <View style={styles.whyBox}>
            <Text style={[styles.whyText, isDark && styles.textGray]}>
              Speak directly to Kaikei to add expenses or ask for business advice in English or Kiswahili.
            </Text>
          </View>

          <PermissionCard
            icon={Bell}
            iconColor="#EA580C"
            iconBg="#FFEDD5"
            title="Notifications"
            desc="Daily summaries"
            granted={notifGranted}
            onPress={() => requestPermission('notification')}
            isDark={isDark}
          />
        </View >
      </ScrollView >

      <View style={[styles.footer, { paddingBottom: 40 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <ShieldCheck size={16} color={isDark ? '#4ade80' : '#16a34a'} />
          <Text style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>Your data is encrypted and stays on your device</Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
          <Text style={styles.primaryButtonText}>Continue</Text>
          <ArrowRight color="#0d1b12" size={20} />
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={handleNext}>
          <Text style={[styles.linkText, isDark && styles.textGray]}>Ask me later</Text>
        </TouchableOpacity>
      </View>
    </View >
  );
};

export default OnboardingScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 24,
  },
  // ... rest of styles

  containerDark: {
    backgroundColor: '#102216',
  },

  // Header
  header: { paddingTop: 60, paddingBottom: 10 },
  headerRight: { alignItems: 'flex-end', paddingTop: 60, paddingBottom: 20 },
  headerLeft: { paddingTop: 60, paddingBottom: 20 },
  langButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'white', borderRadius: 99, borderWidth: 1, borderColor: '#e2e8f0' },
  langButtonDark: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.1)' },
  langText: { fontSize: 12, fontWeight: '600', color: '#475569' },

  // Content Center (Step 1)
  contentCenter: { flex: 1, alignItems: 'center' },
  imageContainer: { width: 320, height: 320, position: 'relative', marginBottom: 32, justifyContent: 'center', alignItems: 'center' },
  blurBg: { position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(19, 236, 91, 0.1)', borderRadius: 999, transform: [{ scale: 0.9 }] },
  mainImageCard: { width: 300, height: 300, borderRadius: 24, overflow: 'hidden', transform: [{ rotate: '-3deg' }], borderWidth: 4, borderColor: 'white', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', backgroundColor: 'rgba(0,0,0,0.3)' }, // Simple gradient replacement

  floatingCard1: { position: 'absolute', bottom: -20, right: -10, width: 140, height: 140, borderRadius: 16, overflow: 'hidden', borderWidth: 4, borderColor: 'white', transform: [{ rotate: '6deg' }], elevation: 12 },
  floatingIcon: { position: 'absolute', top: -20, left: -10, padding: 10, backgroundColor: 'white', borderRadius: 16, transform: [{ rotate: '-6deg' }], elevation: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  floatingIconDark: { backgroundColor: '#1e293b' },

  textBlock: { width: '100%', alignItems: 'center', gap: 10 },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', color: '#0d1b12', lineHeight: 38 },
  subtitle: { fontSize: 18, textAlign: 'center', color: '#475569', paddingHorizontal: 20 },
  caption: { fontSize: 14, color: '#64748b' },
  quote: { marginTop: 10, fontSize: 14, fontStyle: 'italic', fontWeight: '500', color: colors.primaryDark },

  // Form (Step 2)
  scrollContent: { flex: 1 },
  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  progressBar: { flex: 1, height: 6, borderRadius: 99, backgroundColor: '#e2e8f0' },
  stepTitle: { fontSize: 28, fontWeight: 'bold', color: '#0d1b12', marginBottom: 8 },
  stepSubtitle: { fontSize: 16, color: '#475569' },

  inputGroup: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#0d1b12', marginBottom: 8, marginLeft: 4 },
  textInputWrapper: { position: 'relative' },
  textInput: { backgroundColor: 'white', borderRadius: 12, padding: 16, fontSize: 18, color: '#0d1b12', borderWidth: 1, borderColor: '#e2e8f0' },
  textInputDark: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' },

  personaGrid: { gap: 12 },
  personaCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', gap: 16 },
  personaCardDark: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
  personaCardSelected: { borderColor: colors.primary, backgroundColor: 'rgba(19, 236, 91, 0.05)' },
  personaImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  personaImagePlaceholder: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  personaContent: { flex: 1 },
  personaTitle: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },
  personaSubtitle: { fontSize: 12, color: '#64748b' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },

  // Footer / Shared
  footer: { paddingVertical: 24 },
  pagination: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cbd5e1' },
  activeDot: { width: 32, backgroundColor: colors.primary },

  primaryButton: { flexDirection: 'row', height: 56, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  primaryButtonText: { fontSize: 18, fontWeight: 'bold', color: '#0d1b12' },
  disabledButton: { backgroundColor: '#e2e8f0', shadowOpacity: 0 },
  disabledText: { color: '#94a3b8' },

  // Util
  textLight: { color: 'white' },
  textGray: { color: '#94a3b8' },

  // Permissions Step
  permissionCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  permissionCardDark: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
  permissionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  permTitle: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },
  permDesc: { fontSize: 12, color: '#64748b' },
  allowBtn: { backgroundColor: '#f1f5f9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  allowBtnDark: { backgroundColor: 'rgba(255,255,255,0.1)' },
  allowBtnText: { fontSize: 12, fontWeight: '600', color: '#0d1b12' },
  grantedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(19, 236, 91, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(19, 236, 91, 0.2)' },
  grantedText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
  whyBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, marginLeft: 52 },
  whyText: { fontSize: 12, color: '#475569', lineHeight: 18 },
  linkText: { textAlign: 'center', fontSize: 12, color: '#94a3b8' },
});
