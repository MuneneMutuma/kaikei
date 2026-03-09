
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SwipeableSheet, SwipeableSheetRef } from './common/SwipeableSheet';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { X, BrainCircuit, MessageSquare, CheckCircle, Archive, Cpu, Trash2, ArrowRight } from 'lucide-react-native';
import { Insight, Citation } from '../services/intelligence/InsightGenerator';

interface InsightDetailModalProps {
    visible: boolean;
    insight: Insight | null;
    onClose: () => void;
    onArchive?: (id: string) => void;
    onDelete?: (id: string) => void;
    onPillPress?: (citation: Citation) => void;
}

const getSourceBadge = (source?: string) => {
    if (source === 'local_llm') return { label: 'Local AI', icon: BrainCircuit, color: colors.primary };
    if (source === 'cloud_llm') return { label: 'Cloud AI', icon: BrainCircuit, color: '#8B5CF6' }; // Violet
    return { label: 'Rule Based', icon: Cpu, color: '#64748B' }; // Slate
};

export const InsightDetailModal: React.FC<InsightDetailModalProps> = ({ visible, insight, onClose, onArchive, onDelete, onPillPress }) => {
    const sheetRef = React.useRef<SwipeableSheetRef>(null);

    React.useEffect(() => {
        if (visible && insight) {
            sheetRef.current?.present();
        } else {
            sheetRef.current?.dismiss();
        }
    }, [visible, insight]);

    if (!insight) return null;

    const sourceConfig = getSourceBadge(insight.source || (insight.isLlmGenerated ? 'local_llm' : 'rule'));

    const handleArchive = () => {
        Alert.alert(
            "Archive Insight",
            "This insight will be hidden from your feed.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Archive",
                    onPress: () => {
                        if (onArchive) onArchive(insight.id);
                        onClose();
                    }
                }
            ]
        );
    };

    const handleDelete = () => {
        Alert.alert(
            "Delete Insight",
            "Are you sure you want to permanently delete this insight?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        if (onDelete) onDelete(insight.id);
                        onClose();
                    }
                }
            ]
        );
    };

    return (
        <SwipeableSheet
            ref={sheetRef}
            title={insight.title}
            snapPoints={['70%', '90%']}
            onDismiss={onClose}
        >
            <View>
                <ScrollView contentContainerStyle={styles.scrollBody}>
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={[styles.sourceBadge, { backgroundColor: sourceConfig.color }]}>
                                <sourceConfig.icon size={12} color="white" />
                                <Text style={styles.sourceBadgeText}>{sourceConfig.label}</Text>
                            </View>
                            <Text style={styles.typeLabel}>{insight.type.toUpperCase()}</Text>
                        </View>
                    </View>

                    {insight.metric && <Text style={styles.metric}>{insight.metric}</Text>}

                    <View style={styles.divider} />

                    <Text style={styles.description}>{insight.description}</Text>

                    {/* Evidence Section */}
                    {insight.citations && insight.citations.length > 0 && (
                        <View style={styles.evidenceSection}>
                            <Text style={styles.sectionTitle}>Evidence & Context</Text>
                            {insight.citations.map((c, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={styles.evidenceItem}
                                    onPress={() => {
                                        onClose();
                                        if (onPillPress) onPillPress(c);
                                    }}
                                >
                                    <CheckCircle size={16} color={colors.primary} />
                                    <Text style={styles.evidenceText}>{c.label}</Text>
                                    <ArrowRight size={12} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Interactive Future Hint */}
                    <View style={styles.hintBox}>
                        <MessageSquare size={16} color={colors.info} />
                        <Text style={styles.hintText}>
                            This insight was generated based on your last 30 days of activity.
                            Mark as helpful to train the assistant.
                        </Text>
                    </View>
                </ScrollView>

                {/* Footer Actions */}
                <View style={styles.footer}>
                    {onDelete && (
                        <TouchableOpacity style={[styles.btnSecondary, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]} onPress={handleDelete}>
                            <Trash2 size={20} color={colors.error} />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.btnSecondary} onPress={handleArchive}>
                        <Archive size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.btnPrimary} onPress={onClose}>
                        <Text style={styles.btnText}>Got it</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SwipeableSheet>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end'
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '80%',
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24
    },
    closeBtn: {
        padding: 4,
        backgroundColor: '#F1F5F9',
        borderRadius: 20
    },
    typeLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textSecondary,
        letterSpacing: 1
    },
    sourceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12
    },
    sourceBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: 'white'
    },
    scrollBody: {
        paddingBottom: 40,
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 8
    },
    metric: {
        fontSize: 32,
        fontWeight: '800',
        color: colors.primaryDark,
        marginBottom: 16
    },
    divider: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginVertical: 16
    },
    description: {
        fontSize: 16,
        color: '#334155',
        lineHeight: 24,
        marginBottom: 24
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 12,
        textTransform: 'uppercase'
    },
    evidenceSection: {
        backgroundColor: '#F8FAFC',
        padding: 16,
        borderRadius: 16,
        marginBottom: 24
    },
    evidenceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12
    },
    evidenceText: {
        fontSize: 14,
        color: '#475569',
        fontWeight: '500'
    },
    hintBox: {
        flexDirection: 'row',
        gap: 12,
        padding: 16,
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        alignItems: 'center'
    },
    hintText: {
        flex: 1,
        fontSize: 13,
        color: '#1E40AF',
        lineHeight: 18
    },
    footer: {
        marginTop: 'auto',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        flexDirection: 'row',
        gap: 16
    },
    btnPrimary: {
        flex: 1,
        backgroundColor: colors.primary,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center'
    },
    btnSecondary: {
        width: 56,
        height: 56,
        backgroundColor: '#FEF2F2',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#FECACA'
    },
    btnText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0D1B12'
    }
});
