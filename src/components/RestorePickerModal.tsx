import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
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

    useEffect(() => {
        if (visible) {
            setLoading(true);
            const service = new BackupService();
            service.listBackups().then(files => {
                setBackups(files);
                setLoading(false);
            });
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
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Select Backup</Text>
                    </View>

                    <View style={styles.content}>
                        {loading ? (
                            <ActivityIndicator size="large" color={colors.primary} style={{ padding: 40 }} />
                        ) : backups.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>No backups found</Text>
                                <Text style={styles.emptyHint}>
                                    Export your data first to create a backup in Downloads/KaikeiBackups
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={backups}
                                keyExtractor={(item) => item.path}
                                style={{ maxHeight: 300 }}
                                renderItem={({ item }) => (
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
                    </View>
                </View>
            </View>
        </Modal>
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
});
