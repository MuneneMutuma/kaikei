import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { TrendingUp, TrendingDown, ShoppingBasket, Fuel, Utensils, Smartphone, AlertCircle, ArrowRight, CheckCircle, Lightbulb, BrainCircuit, Cpu } from 'lucide-react-native';

export type InsightType = 'alert' | 'opportunity' | 'success' | 'info';

export interface Citation {
    type: string;
    id: string;
    label: string;
}

interface InsightCardProps {
    title: string;
    description: string;
    type: InsightType;
    iconName?: string;
    metric?: string;
    actionLabel?: string;
    citations?: Citation[];
    isLlmGenerated?: boolean;
    source?: string; // 'rule', 'local_llm', 'cloud_llm'
    onAction?: () => void;
    onPress?: () => void;
    onPillPress?: (citation: Citation) => void;
}

const getIcon = (name: string, color: string) => {
    switch (name) {
        case 'TrendingUp': return <TrendingUp size={20} color={color} />;
        case 'TrendingDown': return <TrendingDown size={20} color={color} />;
        case 'ShoppingBasket': return <ShoppingBasket size={20} color={color} />;
        case 'Fuel': return <Fuel size={20} color={color} />;
        case 'Utensils': return <Utensils size={20} color={color} />;
        case 'Smartphone': return <Smartphone size={20} color={color} />;
        case 'Lightbulb': return <Lightbulb size={20} color={color} />;
        default: return <AlertCircle size={20} color={color} />;
    }
};

const getTypeStyles = (type: InsightType) => {
    switch (type) {
        case 'alert':
            return { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', iconBg: '#FEE2E2', badgeBg: '#FEF2F2', badgeText: '#991B1B' };
        case 'success':
            return { bg: '#ECFDF5', border: '#A7F3D0', text: '#059669', iconBg: '#D1FAE5', badgeBg: '#ECFDF5', badgeText: '#065F46' };
        case 'opportunity':
            return { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB', iconBg: '#DBEAFE', badgeBg: '#EFF6FF', badgeText: '#1E40AF' };
        default:
            return { bg: '#F8FAFC', border: '#E2E8F0', text: '#64748B', iconBg: '#F1F5F9', badgeBg: '#F1F5F9', badgeText: '#475569' };
    }
};

const getSourceBadge = (source?: string) => {
    if (source === 'local_llm') return { label: 'Local AI', icon: BrainCircuit, color: colors.primary };
    if (source === 'cloud_llm') return { label: 'Cloud AI', icon: BrainCircuit, color: '#8B5CF6' }; // Violet
    return { label: 'Rule Based', icon: Cpu, color: '#64748B' }; // Slate
};

export const InsightCard: React.FC<InsightCardProps> = ({
    title, description, type, iconName, metric, actionLabel, citations, isLlmGenerated, source, onAction, onPress, onPillPress
}) => {
    const stylesConfig = getTypeStyles(type);
    const sourceConfig = getSourceBadge(source || (isLlmGenerated ? 'local_llm' : 'rule'));

    return (
        <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
            <View style={[styles.card, { borderColor: stylesConfig.border, backgroundColor: 'white' }]}>
                {/* Header / Type Indicator */}
                <View style={styles.header}>
                    <View style={[styles.iconBox, { backgroundColor: stylesConfig.iconBg }]}>
                        {getIcon(iconName || 'AlertCircle', stylesConfig.text)}
                    </View>
                    <View style={styles.headerText}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.typeLabel, { color: stylesConfig.text }]}>{type.toUpperCase()}</Text>

                            {/* Source Badge */}
                            <View style={[styles.sourceBadge, { borderColor: sourceConfig.color }]}>
                                <sourceConfig.icon size={10} color={sourceConfig.color} />
                                <Text style={[styles.sourceBadgeText, { color: sourceConfig.color }]}>{sourceConfig.label}</Text>
                            </View>
                        </View>
                        <Text style={styles.dateLabel}>Just now</Text>
                    </View>
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={styles.title}>{title}</Text>
                        {metric && <Text style={[styles.metric, { color: stylesConfig.text }]}>{metric}</Text>}
                    </View>
                    <Text style={styles.description} numberOfLines={3}>{description}</Text>
                </View>

                {/* Evidence / Citations */}
                {citations && citations.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.citationsContainer}>
                        {citations.map((c, i) => (
                            <TouchableOpacity
                                key={i}
                                activeOpacity={0.7}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    if (onPillPress) onPillPress(c);
                                }}
                            >
                                <View style={[styles.citationPill, { backgroundColor: stylesConfig.badgeBg, borderColor: stylesConfig.border }]}>
                                    <Text style={[styles.citationText, { color: stylesConfig.badgeText }]}>{c.label}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                {/* Action Area */}
                {actionLabel && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: stylesConfig.bg }]} onPress={onAction}>
                        <Text style={[styles.actionText, { color: stylesConfig.text }]}>{actionLabel}</Text>
                        <ArrowRight size={16} color={stylesConfig.text} />
                    </TouchableOpacity>
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12
    },
    iconBox: {
        padding: 8,
        borderRadius: 10,
        marginRight: 12
    },
    headerText: {
        justifyContent: 'center'
    },
    typeLabel: {
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 0.5,
        marginBottom: 2
    },
    sourceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.5)'
    },
    sourceBadgeText: {
        fontSize: 9,
        fontWeight: '700',
    },
    dateLabel: {
        fontSize: 11,
        color: colors.textSecondary
    },
    content: {
        marginBottom: 12
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 6,
        flex: 1
    },
    metric: {
        fontSize: 16,
        fontWeight: '800',
        marginLeft: 8
    },
    description: {
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20
    },
    citationsContainer: {
        flexDirection: 'row',
        marginBottom: 16
    },
    citationPill: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 8,
        borderWidth: 1
    },
    citationText: {
        fontSize: 10,
        fontWeight: '600'
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
    }
});
