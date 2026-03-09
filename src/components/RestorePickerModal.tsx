import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { FlatList } from 'react-native';
import { SwipeableSheet, SwipeableSheetRef } from './common/SwipeableSheet';
import { pick, types } from '@react-native-documents/picker';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { BackupService, BackupFile } from '../services/backup/BackupService';

interface RestorePickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (file: BackupFile) => void;
}

export const RestorePickerModal: React.FC<RestorePickerModalProps> = ({ visible, onClose, onSelect }) => {
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [loading, setLoading] = useState(true);
    const sheetRef = React.useRef<SwipeableSheetRef>(null);

    const pickDocument = async () => {
        try {
            const results = await pick({
                type: [types.allFiles],
            });

            if (results && results.length > 0) {
                const res = results[0];
                // Construct a BackupFile-like object
                onSelect({
                    name: res.name || 'External Backup',
                    path: res.uri,
                    size: Number(res.size || 0),
                    mtime: new Date(),
                });
            }
        } catch (err: any) {
            if (err?.code === 'DOCUMENT_PICKER_CANCELED' || String(err).includes('cancel')) {
                // User cancelled the picker
            } else {
                Alert.alert('Error', 'Failed to pick document: ' + err.message);
            }
        }
    };

    useEffect(() => {
        if (visible) {
            sheetRef.current?.present();
            setLoading(true);
            const service = new BackupService();
            service.listBackups().then(files => {
                setBackups(files);
                setLoading(false);
            });
        } else {
            sheetRef.current?.dismiss();
        }
    }, [visible]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    return (
        <SwipeableSheet
            ref={sheetRef}
            title="Select Backup"
            snapPoints={['50%', '80%']}
            onDismiss={onClose}
        >
            <View>
                <View style={styles.content}>
                    {loading ? (
                        <ActivityIndicator size="large" color={colors.primary} style={{ padding: 40 }} />
                    ) : backups.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No backups found</Text>
                            <Text style={styles.emptyHint}>
                                We couldn't find any backups in common folders.{"\n"}
                                Tap "Browse File..." below to select manually.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={backups}
                            keyExtractor={(item) => item.path}
                            style={{ maxHeight: 400 }}
                            renderItem={({ item }: { item: BackupFile }) => (
                                <TouchableOpacity style={styles.fileRow} onPress={() => onSelect(item)}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.fileMeta}>
                                            {formatDate(item.mtime)} · {formatSize(item.size)}
                                        </Text>
                                    </View>
                                    <Text style={styles.selectText}>Select</Text>
                                </TouchableOpacity>
                            )}
                            ItemSeparatorComponent={() => <View style={styles.separator} />}
                        />
                    )}
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <View style={{ width: 12 }} />
                    <TouchableOpacity style={styles.browseButton} onPress={pickDocument}>
                        <Text style={styles.browseButtonText}>Browse File...</Text>
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
        justifyContent: 'flex-end',
    },
    card: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '70%',
    },
    header: {
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
    },
    content: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 8,
    },
    emptyHint: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
    },
    fileName: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
    },
    fileMeta: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    selectText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
        marginLeft: 12,
    },
    separator: {
        height: 1,
        backgroundColor: colors.border,
    },
    footer: {
        padding: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    cancelButton: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 12,
        backgroundColor: colors.background,
    },
    cancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
    },
    browseButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        backgroundColor: colors.primary,
        borderRadius: 12,
        marginRight: 10,
    },
    browseButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 16,
    },
});
