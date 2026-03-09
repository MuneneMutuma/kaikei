import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Switch, Alert, NativeModules, Linking, PermissionsAndroid } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Settings, LogOut, ChevronRight, User, Shield, CreditCard, Bell, Save, Download, Smartphone, Zap, Battery, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react-native';
import { BackupService } from '../services/backup/BackupService';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { SettingsRepository } from '../services/settings/SettingsRepository';
import { IngestionService } from '../services/ingestion/IngestionService';
import { AutoClassifier } from '../services/intelligence/AutoClassifier';
import { IngestionEvents, INGESTION_EVENT } from '../services/ingestion/IngestionEvents';

import { BackupModal } from '../components/BackupModal';
import { RestorePickerModal } from '../components/RestorePickerModal';
import { BackupFile } from '../services/backup/BackupService';
import { PERSONA_DEFAULTS } from '../services/ledger/Schema';

const { SmsListenerModule } = NativeModules;

export default function ProfileScreen() {
    const navigation = useNavigation();
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [userProfile, setUserProfile] = useState({ name: 'User', persona: 'Standard', email: '' });
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [personaModalVisible, setPersonaModalVisible] = useState(false);

    // Backup State
    const [backupModalVisible, setBackupModalVisible] = useState(false);
    const [backupPath, setBackupPath] = useState<string | undefined>(undefined);
    const [backupError, setBackupError] = useState<string | undefined>(undefined);
    const [backupMode, setBackupMode] = useState<'export' | 'restore'>('export');
    const [restoreCounts, setRestoreCounts] = useState<Record<string, number> | undefined>(undefined);
    const [restorePickerVisible, setRestorePickerVisible] = useState(false);

    // Auto-Import State
    const [autoImportEnabled, setAutoImportEnabled] = useState(false);
    const [alwaysOnEnabled, setAlwaysOnEnabled] = useState(false);
    const [smsPermissionOk, setSmsPermissionOk] = useState(false);
    const [notificationAccessOk, setNotificationAccessOk] = useState(false);
    const [batteryOptimized, setBatteryOptimized] = useState(true); // true = BAD (optimized = killed)
    const [historyEnabled, setHistoryEnabled] = useState(true);
    const [llmEnabled, setLlmEnabled] = useState(false);

    const settingsRepo = React.useMemo(() => new SettingsRepository(), []);
    const expenseRepo = React.useMemo(() => new ExpenseRepository(), []);

    const handleStrategyToggle = async (strategy: 'history' | 'llm', enabled: boolean) => {
        if (strategy === 'history') setHistoryEnabled(enabled);
        if (strategy === 'llm') setLlmEnabled(enabled);

        try {
            await AutoClassifier.getInstance().setStrategyEnabled(strategy, enabled);
        } catch (e) {
            console.error("Failed to set strategy:", e);
            Alert.alert("Error", "Could not update AI settings.");
        }
    };

    // Load auto-import settings and check permissions
    const refreshHealthCheck = useCallback(async () => {
        try {
            const autoEnabled = await settingsRepo.isAutoImportEnabled();
            const alwaysOn = await settingsRepo.isAlwaysOnEnabled();
            setAutoImportEnabled(autoEnabled);
            setAlwaysOnEnabled(alwaysOn);

            // Load AI Strategies
            const historyStr = await expenseRepo.getSetting('ai_history_enabled');
            const llmStr = await expenseRepo.getSetting('ai_llm_enabled');

            setHistoryEnabled(historyStr !== 'false'); // Default TRUE
            setLlmEnabled(llmStr === 'true');          // Default FALSE

            // Check SMS permission
            const smsGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
            setSmsPermissionOk(smsGranted);

            // Check notification access (via native module)
            if (SmsListenerModule?.isNotificationAccessEnabled) {
                try {
                    const notifOk = await SmsListenerModule.isNotificationAccessEnabled();
                    setNotificationAccessOk(notifOk);
                } catch {
                    setNotificationAccessOk(false);
                }
            }

            // Check battery optimization
            if (SmsListenerModule?.isIgnoringBatteryOptimizations) {
                try {
                    const ignoring = await SmsListenerModule.isIgnoringBatteryOptimizations();
                    setBatteryOptimized(!ignoring); // true means NOT ignoring = BAD
                } catch {
                    setBatteryOptimized(true);
                }
            }
        } catch (e) {
            console.warn('Health check error:', e);
        }
    }, [settingsRepo]);

    useEffect(() => {
        refreshHealthCheck();
    }, [refreshHealthCheck]);

    const handleAutoImportToggle = async (enabled: boolean) => {
        if (enabled) {
            // Request SMS permission first
            const result = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.READ_SMS,
                {
                    title: 'SMS Permission',
                    message: 'Kaikei needs SMS access to auto-import your M-Pesa transactions.',
                    buttonPositive: 'Allow',
                    buttonNegative: 'Deny',
                }
            );
            if (result !== PermissionsAndroid.RESULTS.GRANTED) {
                Alert.alert('Permission Required', 'SMS access is needed to auto-import M-Pesa transactions.');
                return;
            }
            setSmsPermissionOk(true);
        }

        setAutoImportEnabled(enabled);
        await settingsRepo.setAutoImportEnabled(enabled);

        if (enabled) {
            await IngestionService.start();
        } else {
            IngestionService.stop();
            // Also disable always-on if auto-import is turned off
            if (alwaysOnEnabled) {
                setAlwaysOnEnabled(false);
                await settingsRepo.setAlwaysOnEnabled(false);
            }
        }
    };

    const handleAlwaysOnToggle = async (enabled: boolean) => {
        if (enabled) {
            // Open notification access settings
            try {
                SmsListenerModule?.openNotificationSettings?.();
            } catch {
                Linking.openSettings();
            }
            Alert.alert(
                'Enable Notification Access',
                'Find "Kaikei" in the list and enable it. This allows detection even when the app is closed.',
                [{ text: 'OK', onPress: () => refreshHealthCheck() }]
            );
        }

        setAlwaysOnEnabled(enabled);
        await settingsRepo.setAlwaysOnEnabled(enabled);
    };

    const handleFixBattery = async () => {
        try {
            SmsListenerModule?.requestBatteryOptimizationExemption?.();
        } catch {
            Linking.openSettings();
        }
        setTimeout(refreshHealthCheck, 2000);
    };

    const loadUserProfile = async () => {
        const settings = await settingsRepo.getUserSettings();
        setUserProfile({
            name: settings.userName || 'User',
            persona: settings.userPersona || 'Standard',
            email: ''
        });
    };

    const handlePersonaSwitch = async (newPersona: string) => {
        await settingsRepo.saveUserProfile(userProfile.name, newPersona);

        // Ensure categories exist for the new persona
        await expenseRepo.ensureCategoriesForPersona(newPersona);

        setUserProfile(prev => ({ ...prev, persona: newPersona }));
        setPersonaModalVisible(false);
        Alert.alert("Success", `Switched to ${newPersona} account.`);
    };

    useEffect(() => {
        loadUserProfile();
    }, []);

    const handleBackup = async () => {
        setBackupMode('export');
        setRestoreCounts(undefined);
        const backupService = new BackupService();
        const result = await backupService.createBackup();

        if (result.success) {
            setBackupPath(result.path);
            setBackupError(undefined);
        } else {
            setBackupError("Could not create backup file. Please check permissions.");
            setBackupPath(undefined);
        }
        setBackupModalVisible(true);
    };

    const handleRestore = () => {
        setRestorePickerVisible(true);
    };

    const handleRestoreFileSelected = (file: BackupFile) => {
        setRestorePickerVisible(false);
        Alert.alert(
            'Restore Data',
            `This will REPLACE all current data with:\n\n${file.name}\n\nThis cannot be undone. Are you sure?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    style: 'destructive',
                    onPress: async () => {
                        setBackupMode('restore');
                        setBackupPath(undefined);
                        const backupService = new BackupService();
                        const result = await backupService.restoreFromFile(file.path);

                        if (result.success) {
                            setRestoreCounts(result.counts);
                            setBackupError(undefined);

                            // 1. Check for new SMS that arrived after this backup was created
                            console.log("Restore complete. Starting catch-up scan...");
                            IngestionService.runCatchUpScan().then(catchUpResult => {
                                console.log("Catch-up complete", catchUpResult);

                                // 2. Restart AI to process newly imported or restored items
                                AutoClassifier.getInstance().restart();

                                // 3. Refresh UI
                                IngestionEvents.emit(INGESTION_EVENT.CATCH_UP_COMPLETE, {
                                    imported: (result.counts?.expenses || 0) + catchUpResult.imported,
                                    skipped: catchUpResult.skipped,
                                    errors: catchUpResult.errors
                                });
                            });
                        } else {
                            setRestoreCounts(undefined);
                            setBackupError(result.error || 'Restore failed.');
                        }
                        setBackupModalVisible(true);
                    },
                },
            ]
        );
    };

    const handleDeleteAll = async () => {
        try {
            const repo = new ExpenseRepository();
            await repo.clearAll();
            setDeleteModalVisible(false);
            console.log("All transactions deleted.");
        } catch (e) {
            console.error(e);
        }
    };

    const renderMenuItem = (icon: React.ReactNode, label: string, value?: string, isSwitch?: boolean) => (
        <TouchableOpacity style={styles.menuItem} disabled={isSwitch}>
            <View style={styles.menuIconContainer}>
                {icon}
            </View>
            <View style={styles.menuTextContainer}>
                <Text style={styles.menuLabel}>{label}</Text>
            </View>
            {isSwitch ? (
                <Switch
                    value={notificationsEnabled}
                    onValueChange={setNotificationsEnabled}
                    trackColor={{ false: '#767577', true: colors.primary }}
                    thumbColor={'white'}
                />
            ) : (
                <View style={styles.menuRight}>
                    {value && <Text style={styles.menuValue}>{value}</Text>}
                    <ChevronRight size={20} color={colors.textSecondary} />
                </View>
            )}
        </TouchableOpacity>
    );

    const StatusIcon = ({ ok }: { ok: boolean }) => ok
        ? <CheckCircle size={16} color={colors.success} />
        : <AlertTriangle size={16} color="#F59E0B" />;

    return (
        <View style={styles.container}>
            <ScreenHeader title="My Profile" subtitle="Account Settings" showNotification={false} />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Card */}
                <TouchableOpacity activeOpacity={0.9} onPress={() => setPersonaModalVisible(true)}>
                    <View style={styles.profileCard}>
                        <View style={styles.avatarContainer}>
                            <Text style={styles.avatarText}>{userProfile.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View>
                            <Text style={styles.userName}>{userProfile.name}</Text>
                            <Text style={styles.userEmail}>{userProfile.persona} Account</Text>
                        </View>
                    </View>
                </TouchableOpacity>

                {/* Section: Account */}
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.section}>
                    {renderMenuItem(<User size={20} color={colors.primary} />, "Personal Info", userProfile.name)}
                    {renderMenuItem(<CreditCard size={20} color={colors.primary} />, "Payment Methods", "M-Pesa")}
                </View>

                {/* Section: M-Pesa Auto-Import */}
                <Text style={styles.sectionTitle}>M-Pesa Auto-Import</Text>
                <View style={styles.section}>
                    {/* Main Toggle */}
                    <View style={styles.menuItem}>
                        <View style={styles.menuIconContainer}>
                            <Smartphone size={20} color={colors.primary} />
                        </View>
                        <View style={styles.menuTextContainer}>
                            <Text style={styles.menuLabel}>Auto-Import Transactions</Text>
                            <Text style={styles.menuSubLabel}>Detect & import M-Pesa SMS</Text>
                        </View>
                        <Switch
                            value={autoImportEnabled}
                            onValueChange={handleAutoImportToggle}
                            trackColor={{ false: '#767577', true: colors.primary }}
                            thumbColor={'white'}
                        />
                    </View>

                    {/* Health Check (only visible when auto-import is ON) */}
                    {autoImportEnabled && (
                        <>
                            {/* SMS Permission Status */}
                            <View style={styles.healthRow}>
                                <StatusIcon ok={smsPermissionOk} />
                                <Text style={styles.healthLabel}>SMS Permission</Text>
                                <Text style={[styles.healthValue, { color: smsPermissionOk ? colors.success : '#F59E0B' }]}>
                                    {smsPermissionOk ? 'Granted' : 'Required'}
                                </Text>
                            </View>

                            {/* Runtime Detection Status */}
                            <View style={styles.healthRow}>
                                <StatusIcon ok={autoImportEnabled} />
                                <Text style={styles.healthLabel}>Runtime Detection</Text>
                                <Text style={[styles.healthValue, { color: colors.success }]}>Active</Text>
                            </View>

                            {/* Always-On Toggle */}
                            <View style={[styles.menuItem, { paddingLeft: 32 }]}>
                                <View style={styles.menuIconContainer}>
                                    <Zap size={20} color={alwaysOnEnabled ? colors.primary : colors.textSecondary} />
                                </View>
                                <View style={styles.menuTextContainer}>
                                    <Text style={styles.menuLabel}>Always-On Detection</Text>
                                    <Text style={styles.menuSubLabel}>Works even when app is closed</Text>
                                </View>
                                <Switch
                                    value={alwaysOnEnabled}
                                    onValueChange={handleAlwaysOnToggle}
                                    trackColor={{ false: '#767577', true: colors.primary }}
                                    thumbColor={'white'}
                                />
                            </View>

                            {/* Always-On Health (only when enabled) */}
                            {alwaysOnEnabled && (
                                <>
                                    <View style={styles.healthRow}>
                                        <StatusIcon ok={notificationAccessOk} />
                                        <Text style={styles.healthLabel}>Notification Access</Text>
                                        {notificationAccessOk ? (
                                            <Text style={[styles.healthValue, { color: colors.success }]}>Enabled</Text>
                                        ) : (
                                            <TouchableOpacity onPress={() => SmsListenerModule?.openNotificationSettings?.()}>
                                                <Text style={[styles.healthValue, { color: '#F59E0B' }]}>Tap to enable</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    <View style={styles.healthRow}>
                                        <StatusIcon ok={!batteryOptimized} />
                                        <Text style={styles.healthLabel}>Battery Optimization</Text>
                                        {!batteryOptimized ? (
                                            <Text style={[styles.healthValue, { color: colors.success }]}>Exempt</Text>
                                        ) : (
                                            <TouchableOpacity onPress={handleFixBattery}>
                                                <Text style={[styles.healthValue, { color: '#F59E0B' }]}>Tap to fix</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </>
                            )}

                            {/* Catch-up Scan Status */}
                            <View style={styles.healthRow}>
                                <StatusIcon ok={true} />
                                <Text style={styles.healthLabel}>Catch-up Scan</Text>
                                <Text style={[styles.healthValue, { color: colors.success }]}>Active on launch</Text>
                            </View>
                        </>
                    )}
                    {/* Auto-Classifier Strategies */}
                    <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 8 }]}>Auto-Classification</Text>

                    {/* Strategy 1: History / Rule Based */}
                    <View style={[styles.menuItem, { paddingLeft: 16 }]}>
                        <View style={styles.menuIconContainer}>
                            <Zap size={20} color={historyEnabled ? colors.primary : colors.textSecondary} />
                        </View>
                        <View style={styles.menuTextContainer}>
                            <Text style={styles.menuLabel}>Rule & History Based</Text>
                            <Text style={styles.menuSubLabel}>Safe. Uses your past verifictions.</Text>
                        </View>
                        <Switch
                            value={historyEnabled}
                            onValueChange={(val) => handleStrategyToggle('history', val)}
                            trackColor={{ false: '#767577', true: colors.primary }}
                            thumbColor={'white'}
                        />
                    </View>

                    {/* Strategy 2: LLM Based */}
                    <View style={[styles.menuItem, { paddingLeft: 16 }]}>
                        <View style={styles.menuIconContainer}>
                            <Sparkles size={20} color={llmEnabled ? colors.primary : colors.textSecondary} />
                        </View>
                        <View style={styles.menuTextContainer}>
                            <Text style={styles.menuLabel}>LLM / AI Based</Text>
                            <Text style={styles.menuSubLabel}>Experimental. Can hallucinate.</Text>
                        </View>
                        <Switch
                            value={llmEnabled}
                            onValueChange={(val) => handleStrategyToggle('llm', val)}
                            trackColor={{ false: '#767577', true: colors.primary }}
                            thumbColor={'white'}
                        />
                    </View>
                </View>

                {/* Section: Settings */}
                <Text style={styles.sectionTitle}>Settings</Text>
                <View style={styles.section}>
                    {renderMenuItem(<Bell size={20} color={colors.primary} />, "Notifications", undefined, true)}
                    {renderMenuItem(<Shield size={20} color={colors.primary} />, "Privacy & Security")}
                    <TouchableOpacity onPress={() => {
                        try {
                            (navigation as any).navigate('AiManagement');
                        } catch (e: any) {
                            Alert.alert("Error", e.message);
                        }
                    }}>
                        <View style={styles.menuItem}>
                            <View style={styles.menuIconContainer}>
                                <Zap size={20} color={colors.primary} />
                            </View>
                            <View style={styles.menuTextContainer}>
                                <Text style={styles.menuLabel}>AI & Intelligence</Text>
                            </View>
                            <View style={styles.menuRight}>
                                <Text style={styles.menuValue}>Offline Model</Text>
                                <ChevronRight size={20} color={colors.textSecondary} />
                            </View>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBackup}>
                        <View style={styles.menuItem}>
                            <View style={styles.menuIconContainer}>
                                <Save size={20} color={colors.primary} />
                            </View>
                            <View style={styles.menuTextContainer}>
                                <Text style={styles.menuLabel}>Export Data (Backup)</Text>
                            </View>
                            <View style={styles.menuRight}>
                                <ChevronRight size={20} color={colors.textSecondary} />
                            </View>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleRestore}>
                        <View style={styles.menuItem}>
                            <View style={styles.menuIconContainer}>
                                <Download size={20} color={colors.primary} />
                            </View>
                            <View style={styles.menuTextContainer}>
                                <Text style={styles.menuLabel}>Restore Data</Text>
                            </View>
                            <View style={styles.menuRight}>
                                <ChevronRight size={20} color={colors.textSecondary} />
                            </View>
                        </View>
                    </TouchableOpacity>

                    {/* Delete All Data */}
                    <TouchableOpacity onPress={() => setDeleteModalVisible(true)}>
                        <View style={styles.menuItem}>
                            <View style={[styles.menuIconContainer, { backgroundColor: '#FFEBEE' }]}>
                                <LogOut size={20} color={colors.error} />
                            </View>
                            <View style={styles.menuTextContainer}>
                                <Text style={[styles.menuLabel, { color: colors.error }]}>Delete All Data</Text>
                            </View>
                        </View>
                    </TouchableOpacity>

                    {renderMenuItem(<Settings size={20} color={colors.primary} />, "App Preferences")}
                </View>

                {/* Logout */}
                <Text style={styles.version}>Version 1.0.0 (Beta)</Text>
            </ScrollView>

            {/* Custom Delete Confirmation Modal */}
            {deleteModalVisible && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Reset Database</Text>
                        <Text style={styles.modalText}>
                            Are you sure you want to delete ALL transactions? This cannot be undone.
                        </Text>
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnCancel]}
                                onPress={() => setDeleteModalVisible(false)}
                            >
                                <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnDelete]}
                                onPress={handleDeleteAll}
                            >
                                <Text style={styles.modalBtnTextDelete}>Delete All</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            <BackupModal
                visible={backupModalVisible}
                onClose={() => setBackupModalVisible(false)}
                filePath={backupPath}
                error={backupError}
                mode={backupMode}
                restoreCounts={restoreCounts}
            />
            <RestorePickerModal
                visible={restorePickerVisible}
                onClose={() => setRestorePickerVisible(false)}
                onSelect={handleRestoreFileSelected}
            />

            {/* Persona Switcher Modal */}
            {personaModalVisible && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Switch Persona</Text>
                        <Text style={styles.modalText}>
                            Select a new persona to customize your categories.
                        </Text>
                        {Object.keys(PERSONA_DEFAULTS).filter(p => p !== 'User').map(p => (
                            <TouchableOpacity
                                key={p}
                                style={[styles.modalBtn, { backgroundColor: '#E3F2FD', marginBottom: 8, width: '100%', flex: 0 }]}
                                onPress={() => handlePersonaSwitch(p)}
                            >
                                <Text style={[styles.modalBtnTextDelete, { color: colors.text }]}>{p}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={[styles.modalBtn, styles.modalBtnCancel, { marginTop: 8, width: '100%', flex: 0 }]}
                            onPress={() => setPersonaModalVisible(false)}
                        >
                            <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 120,
    },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: 20,
        borderRadius: 16,
        marginBottom: 24,
        elevation: 2,
        shadowColor: 'black',
        shadowOpacity: 0.05,
        shadowRadius: 10,
    },
    avatarContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    avatarText: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
    },
    userName: {
        ...typography.subHeader,
        color: colors.text,
        marginBottom: 4,
    },
    userEmail: {
        ...typography.caption,
        color: colors.textSecondary,
    },
    sectionTitle: {
        ...typography.caption,
        color: colors.textSecondary,
        marginBottom: 10,
        marginLeft: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    section: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 8,
        marginBottom: 24,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    menuIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    menuTextContainer: {
        flex: 1,
    },
    menuLabel: {
        ...typography.body,
        fontWeight: '500',
        color: colors.text,
    },
    menuRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuValue: {
        ...typography.caption,
        color: colors.textSecondary,
        marginRight: 8,
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFEBEE',
        padding: 16,
        borderRadius: 12,
        marginTop: 10,
    },
    logoutText: {
        ...typography.body,
        color: colors.error,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    version: {
        textAlign: 'center',
        color: colors.textSecondary,
        marginTop: 24,
        fontSize: 12,
    },
    // Modal Styles
    modalOverlay: {
        position: 'absolute',
        top: 0, bottom: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
    },
    modalContainer: {
        width: '85%',
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        elevation: 5
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 12
    },
    modalText: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20
    },
    modalActions: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between'
    },
    modalBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        marginHorizontal: 8
    },
    modalBtnCancel: {
        backgroundColor: '#f5f5f5'
    },
    modalBtnDelete: {
        backgroundColor: colors.error
    },
    modalBtnTextCancel: {
        color: colors.textSecondary,
        fontWeight: '600'
    },
    modalBtnTextDelete: {
        color: 'white',
        fontWeight: '600'
    },
    // Auto-Import Health Check
    menuSubLabel: {
        ...typography.caption,
        color: colors.textSecondary,
        marginTop: 2,
    },
    healthRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        marginLeft: 32,
    },
    healthLabel: {
        ...typography.body,
        fontSize: 13,
        color: colors.textSecondary,
        flex: 1,
        marginLeft: 8,
    },
    healthValue: {
        ...typography.caption,
        fontWeight: '600',
        fontSize: 12,
    },
});
