import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Switch, Alert } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Settings, LogOut, ChevronRight, User, Shield, CreditCard, Bell, Save } from 'lucide-react-native';
import { BackupService } from '../services/backup/BackupService';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';

import { BackupModal } from '../components/BackupModal';

export default function ProfileScreen() {
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [userProfile, setUserProfile] = useState({ name: 'User', persona: 'Standard', email: '' });
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);

    // Backup State
    const [backupModalVisible, setBackupModalVisible] = useState(false);
    const [backupPath, setBackupPath] = useState<string | undefined>(undefined);
    const [backupError, setBackupError] = useState<string | undefined>(undefined);

    React.useEffect(() => {
        const loadProfile = async () => {
            try {
                const { SettingsRepository } = require('../services/settings/SettingsRepository');
                const settings = new SettingsRepository();
                const data = await settings.getUserSettings();
                setUserProfile({
                    name: data.userName || 'User',
                    persona: data.userPersona || 'Standard',
                    email: 'user@kaikei.app'
                });
            } catch (e) {
                console.error("Profile load error", e);
            }
        };
        loadProfile();
    }, []);

    const handleBackup = async () => {
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

    return (
        <View style={styles.container}>
            <ScreenHeader title="My Profile" subtitle="Account Settings" showNotification={false} />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatarContainer}>
                        <Text style={styles.avatarText}>{userProfile.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View>
                        <Text style={styles.userName}>{userProfile.name}</Text>
                        <Text style={styles.userEmail}>{userProfile.persona} Account</Text>
                    </View>
                </View>

                {/* Section: Account */}
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.section}>
                    {renderMenuItem(<User size={20} color={colors.primary} />, "Personal Info", userProfile.name)}
                    {renderMenuItem(<CreditCard size={20} color={colors.primary} />, "Payment Methods", "M-Pesa")}
                </View>

                {/* Section: Settings */}
                <Text style={styles.sectionTitle}>Settings</Text>
                <View style={styles.section}>
                    {renderMenuItem(<Bell size={20} color={colors.primary} />, "Notifications", undefined, true)}
                    {renderMenuItem(<Shield size={20} color={colors.primary} />, "Privacy & Security")}
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
            />
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
    }
});
