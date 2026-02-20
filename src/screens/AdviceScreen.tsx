
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, Image, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { ScreenHeader } from '../components/ScreenHeader';
import { InsightCard } from '../components/InsightCard';
import { InsightDetailModal } from '../components/InsightDetailModal';
import { InsightGenerator, Insight } from '../services/intelligence/InsightGenerator';
import { InsightRepository } from '../services/intelligence/InsightRepository';
import { SettingsRepository } from '../services/settings/SettingsRepository';
import { useFocusEffect } from '@react-navigation/native';
import { Sparkles, BrainCircuit, Zap, Cloud, Archive, Inbox } from 'lucide-react-native';

const AdviceScreen = ({ navigation }: any) => {
    const [insights, setInsights] = useState<Insight[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    // Tab State
    const [activeTab, setActiveTab] = useState<'inbox' | 'archive'>('inbox');

    // AI Settings
    const [isLocalModel, setIsLocalModel] = useState(true);

    // Detail Modal State
    const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    // Repositories
    const generator = React.useMemo(() => new InsightGenerator(), []);
    const repo = React.useMemo(() => new InsightRepository(), []);
    const settingsRepo = React.useMemo(() => new SettingsRepository(), []);

    const loadInsights = useCallback(async () => {
        setLoading(true);
        try {
            if (activeTab === 'inbox') {
                // Run checks only for inbox/active flow
                await generator.generateDailyInsights();
                await generator.generateMonthlyInsights();

                const data = await repo.getInsights('active');
                setInsights(data);
            } else {
                const data = await repo.getInsights('archived');
                setInsights(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [generator, repo, activeTab]);

    useFocusEffect(
        useCallback(() => {
            loadInsights();
            StatusBar.setBarStyle('dark-content');
        }, [loadInsights])
    );

    const handleCardPress = (insight: Insight) => {
        setSelectedInsight(insight);
        setModalVisible(true);
    };

    const handleArchive = async (id: string) => {
        // Optimistic update
        setInsights(current => current.filter(i => i.id !== id));
        try {
            await repo.archiveInsight(id);
            if (activeTab === 'archive') loadInsights(); // Reload if we are in archive (unlikely action but safe)
        } catch (e) {
            console.error("Failed to archive:", e);
            loadInsights();
        }
    };

    const handleDelete = async (id: string) => {
        // Optimistic update
        setInsights(current => current.filter(i => i.id !== id));
        try {
            await repo.deleteInsight(id);
        } catch (e) {
            console.error("Failed to delete:", e);
            loadInsights();
        }
    };

    const handleFabPress = async () => {
        setGenerating(true);
        try {
            const newInsight = await generator.generateUserInitiatedAdvice(!isLocalModel);
            if (newInsight) {
                if (activeTab === 'inbox') {
                    setInsights(prev => [newInsight, ...prev]);
                } else {
                    // If generated while in archive, offer to switch? or just let it be.
                    // Better to switch to inbox implicitly?
                    setActiveTab('inbox');
                    // loadInsights will trigger on effect but we can manually set to avoid flicker
                    // Actually, useFocusEffect deps might conflict. simplified:
                    Alert.alert("New Advice", "New advice added to Inbox.");
                }
                handleCardPress(newInsight);
            } else {
                Alert.alert("No new advice", "The assistant couldn't find a new specific insight right now. Try adding more transactions!");
            }
        } catch (e) {
            Alert.alert("Error", "Failed to generate advice. Please try again.");
        } finally {
            setGenerating(false);
        }
    };

    const toggleModel = () => {
        setIsLocalModel(!isLocalModel);
    };

    const handlePillPress = (citation: any) => {
        // Navigate to Analytics (Pie Chart) with highlight param
        // Citation ID is usually the category name like "Fuel"
        if (citation && citation.id) {
            navigation.navigate('Analytics', {
                highlightCategory: citation.id
            });
        }
    };

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            <ScreenHeader
                title="Smart Insights"
                subtitle="AI-Powered Financial Advice"
                showNotification={false}
                actionIcon={null}
            />

            {/* Tabs & Controls */}
            <View style={styles.controlsBar}>
                {/* Tabs */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'inbox' && styles.tabActive]}
                        onPress={() => setActiveTab('inbox')}
                    >
                        <Inbox size={14} color={activeTab === 'inbox' ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.tabText, activeTab === 'inbox' && styles.tabTextActive]}>Inbox</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'archive' && styles.tabActive]}
                        onPress={() => setActiveTab('archive')}
                    >
                        <Archive size={14} color={activeTab === 'archive' ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.tabText, activeTab === 'archive' && styles.tabTextActive]}>Archive</Text>
                    </TouchableOpacity>
                </View>

                {/* Model Toggle */}
                <TouchableOpacity style={styles.toggleBtn} onPress={toggleModel} activeOpacity={0.7}>
                    <Text style={[styles.toggleLabel, isLocalModel && styles.toggleActive]}>Local</Text>
                    <View style={[styles.toggleTrack, isLocalModel ? styles.trackLocal : styles.trackCloud]}>
                        <View style={[styles.toggleThumb, { transform: [{ translateX: isLocalModel ? 0 : 20 }] }]}>
                            {isLocalModel ? <Zap size={12} color="#F59E0B" /> : <Cloud size={12} color="#8B5CF6" />}
                        </View>
                    </View>
                    <Text style={[styles.toggleLabel, !isLocalModel && styles.toggleActive]}>Cloud</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <Image
                source={{ uri: 'https://cdn-icons-png.flaticon.com/512/7486/7486747.png' }}
                style={{ width: 100, height: 100, opacity: 0.5, marginBottom: 16 }}
            />
            <Text style={styles.emptyTitle}>
                {activeTab === 'inbox' ? "No Insights Yet" : "Archive is Empty"}
            </Text>
            <Text style={styles.emptyText}>
                {activeTab === 'inbox'
                    ? "Use the + button to ask the AI for advice, or wait for automatic daily tips."
                    : "Insights you archive will appear here."}
            </Text>
        </View>
    );

    return (
        <View style={styles.container}>
            {renderHeader()}

            <FlatList
                contentContainerStyle={styles.listContent}
                data={insights}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <InsightCard
                        title={item.title}
                        description={item.description}
                        type={item.type}
                        iconName={item.icon}
                        metric={item.metric}
                        actionLabel={item.actionLabel}
                        citations={item.citations}
                        isLlmGenerated={item.isLlmGenerated}
                        source={item.source}
                        onPress={() => handleCardPress(item)}
                        onAction={() => handleCardPress(item)}
                        onPillPress={handlePillPress}
                    />
                )}
                ListEmptyComponent={!loading ? renderEmpty : null}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={loadInsights} colors={[colors.primary]} />
                }
            />

            {/* FAB (Only on Inbox) */}
            {activeTab === 'inbox' && (
                <TouchableOpacity
                    style={[styles.fab, generating && styles.fabDisabled]}
                    onPress={handleFabPress}
                    disabled={generating}
                >
                    {generating ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Sparkles size={24} color="white" />
                    )}
                </TouchableOpacity>
            )}

            <InsightDetailModal
                visible={modalVisible}
                insight={selectedInsight}
                onClose={() => setModalVisible(false)}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onPillPress={handlePillPress}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background
    },
    headerContainer: {
        backgroundColor: colors.background,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9'
    },
    controlsBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 8,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        padding: 4,
        gap: 4
    },
    tabBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8
    },
    tabActive: {
        backgroundColor: 'white',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 1,
        elevation: 1
    },
    tabText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary
    },
    tabTextActive: {
        color: colors.primary
    },
    toggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(0,0,0,0.03)',
        padding: 4,
        borderRadius: 20
    },
    toggleLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#94A3B8'
    },
    toggleActive: {
        color: colors.text
    },
    toggleTrack: {
        width: 44,
        height: 24,
        borderRadius: 12,
        padding: 2,
        justifyContent: 'center'
    },
    trackLocal: {
        backgroundColor: '#FEF3C7' // Amber 100
    },
    trackCloud: {
        backgroundColor: '#EDE9FE' // Violet 100
    },
    toggleThumb: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
        elevation: 2
    },
    listContent: {
        padding: 20,
        paddingTop: 16,
        paddingBottom: 100
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
        paddingHorizontal: 32
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 8
    },
    emptyText: {
        textAlign: 'center',
        color: colors.textSecondary,
        lineHeight: 22
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6
    },
    fabDisabled: {
        opacity: 0.7
    }
});

export default AdviceScreen;
