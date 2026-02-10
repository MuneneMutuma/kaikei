import React, { useState, useRef } from 'react';
import {
    View, Text, Modal, TouchableOpacity, StyleSheet, FlatList,
    ActivityIndicator, Alert, SafeAreaView, PanResponder,
    Animated, Pressable, Platform
} from 'react-native';
import { Expense, Category } from '../services/ledger/Schema';

interface SmartSuggestionDetailModalProps {
    visible: boolean;
    onClose: () => void;
    recipientName: string;
    transactions: Expense[];
    categories: Category[];
    onConfirmBatch: (categoryId: string, selectedIds: string[]) => Promise<void>;
}

export const SmartSuggestionDetailModal = ({
    visible,
    onClose,
    recipientName,
    transactions,
    categories,
    onConfirmBatch
}: SmartSuggestionDetailModalProps) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [isCategoryPickerVisible, setIsCategoryPickerVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    // 1. Ensure the Animated Value is fresh
    const panY = useRef(new Animated.Value(0)).current;

    // 2. Optimized PanResponder
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false, // Don't steal the initial tap
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // ONLY take over if user drags down more than 10px
                return Math.abs(gestureState.dy) > 10 && gestureState.dy > 0;
            },
            onPanResponderMove: Animated.event([null, { dy: panY }], {
                useNativeDriver: false, // Must be false for PanResponder move
            }),
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 150) {
                    Animated.timing(panY, {
                        toValue: 800, // Drive it off screen
                        duration: 300,
                        useNativeDriver: true,
                    }).start(() => {
                        onClose(); // Call close AFTER animation
                    });
                } else {
                    Animated.spring(panY, {
                        toValue: 0,
                        useNativeDriver: true,
                        friction: 8,
                    }).start();
                }
            },
        })
    ).current;

    // 3. CRITICAL: Lifecycle sync
    React.useEffect(() => {
        if (visible) {
            panY.setValue(0); // Reset position instantly
            setSelectedIds(new Set(transactions.map(t => t.id)));
        }
    }, [visible, transactions]);

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleConfirm = async () => {
        if (!selectedCategoryId) {
            Alert.alert("Select Category", "Please pick a category first.");
            return;
        }
        if (selectedIds.size === 0) {
            Alert.alert("Select Transactions", "Please select at least one transaction.");
            return;
        }

        setLoading(true);
        try {
            await onConfirmBatch(selectedCategoryId, Array.from(selectedIds));
            onClose();
        } catch (e) {
            Alert.alert("Error", "Failed to update transactions.");
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: Expense }) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                style={[styles.itemCard, isSelected && styles.itemSelected]}
                onPress={() => toggleSelection(item.id)}
            >
                <View style={[styles.checkbox, isSelected ? styles.checked : styles.unchecked]}>
                    {isSelected && <Text style={{ color: 'white', fontSize: 12 }}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[styles.amount, { color: item.type === 'income' ? '#4CAF50' : '#F44336' }]}>
                            {item.type === 'income' ? '+' : '-'} Ksh {item.amount.toLocaleString()}
                        </Text>
                        <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
                    </View>
                    <Text style={styles.participant}>
                        {item.type === 'income' ? 'From: ' : 'To: '}
                        <Text style={{ fontWeight: 'bold' }}>
                            {item.type === 'income' ? (item.sender || 'Unknown') : (item.recipient || 'Unknown')}
                        </Text>
                    </Text>
                    <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <Animated.View
                    style={[
                        styles.container, 
                        { 
                            transform: [{ 
                                translateY: panY.interpolate({
                                    inputRange: [0, 800],
                                    outputRange: [0, 800],
                                    extrapolate: 'clamp' // Prevents pulling the modal UP
                                }) 
                            }] 
                        }
                    ]}
                >
                    {/* GESTURE ZONE - ONLY THE HEADER */}
                    <View style={styles.header} {...panResponder.panHandlers}>
                        <View style={styles.handle} />
                        <Text style={styles.title}>Review: {recipientName}</Text>
                        <Text style={styles.subtitle}>{transactions.length} transactions found</Text>
                    </View>

                    <FlatList
                        data={transactions}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.list}
                        initialNumToRender={10}
                        windowSize={5}
                        maxToRenderPerBatch={10}
                        removeClippedSubviews={true}
                        style={{ flex: 1 }}
                    />

                    {/* INTERACTION ZONE - NO PAN HANDLERS HERE */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.pickerBtn}
                            onPress={() => setIsCategoryPickerVisible(true)}
                        >
                            <Text style={styles.pickerText}>
                                {categories.find(c => c.id === selectedCategoryId)?.name || "Select Category..."}
                            </Text>
                            <Text>▼</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.confirmBtn, (!selectedCategoryId || selectedIds.size === 0) && styles.disabledBtn]}
                            onPress={handleConfirm}
                            disabled={loading || !selectedCategoryId || selectedIds.size === 0}
                        >
                            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.confirmText}>Categorize ({selectedIds.size})</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={() => {
                                console.log("Cancel Clicked");
                                onClose();
                            }}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>

            {/* Category Picker Modal (Nested) */}
            <Modal visible={isCategoryPickerVisible} transparent={true} animationType="fade">
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setIsCategoryPickerVisible(false)} />
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerTitle}>Select Category</Text>
                        <FlatList
                            data={categories}
                            keyExtractor={c => c.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.catItem} onPress={() => {
                                    setSelectedCategoryId(item.id);
                                    setIsCategoryPickerVisible(false);
                                }}>
                                    <Text style={styles.catText}>{item.name}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity style={styles.closePickerBtn} onPress={() => setIsCategoryPickerVisible(false)}>
                            <Text>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: { backgroundColor: '#F5F7FA', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '85%', overflow: 'hidden' },
    header: { padding: 20, backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, alignItems: 'center', zIndex: 10 },
    handle: { width: 40, height: 5, backgroundColor: '#DDD', borderRadius: 3, marginBottom: 15 },
    title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    subtitle: { fontSize: 12, color: '#666', marginTop: 4 },

    list: { padding: 15 },
    itemCard: { flexDirection: 'row', backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
    itemSelected: { borderColor: '#2196F3', borderWidth: 1, backgroundColor: '#E3F2FD' },
    checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#CCC', marginRight: 15, alignItems: 'center', justifyContent: 'center' },
    checked: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
    unchecked: {},
    amount: { fontWeight: 'bold', fontSize: 16, color: '#333' },
    date: { fontSize: 12, color: '#999' },
    participant: { fontSize: 14, color: '#333', marginTop: 2 },
    desc: { fontSize: 12, color: '#777', marginTop: 2 },

    footer: {
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20, // Add extra space for the home bar
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderColor: '#EEE',
        zIndex: 99
    },
    pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderWidth: 1, borderColor: '#DDD', borderRadius: 10, marginBottom: 15 },
    pickerText: { fontSize: 16, color: '#333' },
    confirmBtn: { backgroundColor: '#2196F3', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
    disabledBtn: { backgroundColor: '#B0BEC5' },
    confirmText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    cancelBtn: { alignItems: 'center', padding: 10 },
    cancelText: { color: '#666', fontSize: 16 },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    pickerContainer: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '60%', elevation: 5 },
    pickerTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
    catItem: { padding: 15, borderBottomWidth: 1, borderColor: '#EEE' },
    catText: { fontSize: 16 },
    closePickerBtn: { marginTop: 15, alignItems: 'center', padding: 10 }
});
