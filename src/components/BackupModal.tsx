import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Platform } from 'react-native';
import { SwipeableSheet, SwipeableSheetRef } from './common/SwipeableSheet';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

interface BackupModalProps {
    visible: boolean;
    onClose: () => void;
    filePath?: string;
    error?: string;
    mode?: 'export' | 'restore';
    restoreCounts?: { expenses: number; categories: number; settings: number; ignored: number };
}

export const BackupModal: React.FC<BackupModalProps> = ({ visible, onClose, filePath, error, mode = 'export', restoreCounts }) => {
    const sheetRef = React.useRef<SwipeableSheetRef>(null);

    React.useEffect(() => {
        if (visible) {
            sheetRef.current?.present();
        } else {
            sheetRef.current?.dismiss();
        }
    }, [visible]);

    const handleShare = async () => {
        if (!filePath) return;
        try {
            await Share.share({
                title: 'Kaikei Backup',
                message: 'Here is your Kaikei data backup.',
                url: Platform.OS === 'ios' ? filePath : `file://${filePath}`,
            });
        } catch (e) {
            console.error(e);
        }
    };

    const isRestore = mode === 'restore';
    const headerColor = error ? colors.danger : colors.success;
    const headerTitle = error
        ? (isRestore ? 'Restore Failed' : 'Backup Failed')
        : (isRestore ? 'Restore Complete' : 'Backup Complete');

    return (
        <SwipeableSheet
            ref={sheetRef}
            title={headerTitle}
            snapPoints={['40%', '60%']}
            onDismiss={onClose}
        >
            <View>
                {/* Content */}
                <View style={styles.content}>
                    {error ? (
                        <View style={[styles.errorBox, { backgroundColor: colors.danger + '10' }]}>
                            <Text style={[styles.text, { color: colors.danger }]}>{error}</Text>
                        </View>
                    ) : isRestore ? (
                        <>
                            <Text style={styles.text}>Your data has been restored successfully.</Text>
                            {restoreCounts && (
                                <View style={styles.pathContainer}>
                                    <Text style={styles.label}>Restored:</Text>
                                    <Text style={styles.countRow}>📊 {restoreCounts.expenses} expenses</Text>
                                    <Text style={styles.countRow}>📁 {restoreCounts.categories} categories</Text>
                                    <Text style={styles.countRow}>⚙️ {restoreCounts.settings} settings</Text>
                                    {restoreCounts.ignored > 0 && (
                                        <Text style={styles.countRow}>🚫 {restoreCounts.ignored} ignored transactions</Text>
                                    )}
                                </View>
                            )}
                            <Text style={styles.hint}>
                                Restart the app for all changes to take effect.
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text style={styles.text}>Your data has been securely exported.</Text>
                            <View style={styles.pathContainer}>
                                <Text style={styles.label}>Saved to:</Text>
                                <Text style={styles.path}>{filePath}</Text>
                            </View>
                            <Text style={styles.hint}>
                                Check your "Downloads/KaikeiBackups" folder.
                            </Text>
                        </>
                    )}
                </View>

                {/* Actions */}
                <View style={styles.footer}>
                    {!error && !isRestore && filePath && (
                        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleShare}>
                            <Text style={styles.buttonTextPrimary}>Share / Open</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
                        <Text style={styles.buttonTextSecondary}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SwipeableSheet>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.lg,
    },
    card: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: colors.surface,
        borderRadius: 20,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    header: {
        padding: spacing.md,
        alignItems: 'center',
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    content: {
        padding: spacing.lg,
    },
    text: {
        fontSize: 16,
        color: colors.text,
        marginBottom: spacing.md,
    },
    errorBox: {
        padding: spacing.md,
        borderRadius: 12,
        marginBottom: spacing.md,
    },
    pathContainer: {
        backgroundColor: colors.background,
        padding: spacing.sm,
        borderRadius: 8,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    label: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '600',
        marginBottom: 4,
    },
    path: {
        fontSize: 13,
        color: colors.primary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    countRow: {
        fontSize: 14,
        color: colors.text,
        paddingVertical: 2,
    },
    hint: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    footer: {
        flexDirection: 'row',
        padding: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
    },
    primaryButton: {
        backgroundColor: colors.primary,
    },
    secondaryButton: {
        backgroundColor: colors.background,
    },
    buttonTextPrimary: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    buttonTextSecondary: {
        color: colors.text,
        fontWeight: '600',
        fontSize: 16,
    },
});
