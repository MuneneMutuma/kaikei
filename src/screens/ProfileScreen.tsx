import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Switch } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Settings, LogOut, ChevronRight, User, Shield, CreditCard, Bell } from 'lucide-react-native';

export default function ProfileScreen() {
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);

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
                        <Text style={styles.avatarText}>JD</Text>
                    </View>
                    <View>
                        <Text style={styles.userName}>John Doe</Text>
                        <Text style={styles.userEmail}>john.doe@example.com</Text>
                    </View>
                </View>

                {/* Section: Account */}
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.section}>
                    {renderMenuItem(<User size={20} color={colors.primary} />, "Personal Info")}
                    {renderMenuItem(<CreditCard size={20} color={colors.primary} />, "Payment Methods", "M-Pesa")}
                </View>

                {/* Section: Settings */}
                <Text style={styles.sectionTitle}>Settings</Text>
                <View style={styles.section}>
                    {renderMenuItem(<Bell size={20} color={colors.primary} />, "Notifications", undefined, true)}
                    {renderMenuItem(<Shield size={20} color={colors.primary} />, "Privacy & Security")}
                    {renderMenuItem(<Settings size={20} color={colors.primary} />, "App Preferences")}
                </View>

                {/* Logout */}
                <TouchableOpacity style={styles.logoutBtn}>
                    <LogOut size={20} color={colors.error} />
                    <Text style={styles.logoutText}>Log Out</Text>
                </TouchableOpacity>

                <Text style={styles.version}>Version 1.0.0 (Beta)</Text>
            </ScrollView>
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
    }
});
