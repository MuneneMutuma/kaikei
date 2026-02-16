import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { CloudOff, Settings } from 'lucide-react-native';
import { colors } from '../theme/colors';

interface OfflineVoiceGuideProps {
    visible: boolean;
    onClose: () => void;
    onOpenSettings: () => void;
}

export const OfflineVoiceGuide = ({ visible, onClose, onOpenSettings }: OfflineVoiceGuideProps) => {
    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.iconContainer}>
                        <CloudOff size={32} color={colors.primary} />
                    </View>

                    <Text style={styles.title}>Offline Voice Setup</Text>

                    <Text style={styles.description}>
                        To use voice input without internet, you need to download the language pack.
                    </Text>

                    <View style={styles.stepsContainer}>
                        <Text style={styles.step}>1. Tap "Open Settings" below</Text>
                        <Text style={styles.step}>2. Allow "Offline Speech Recognition"</Text>
                        <Text style={styles.step}>3. Download <Text style={{ fontWeight: 'bold' }}>English (US/UK)</Text> and <Text style={{ fontWeight: 'bold' }}>Swahili</Text></Text>
                    </View>

                    <View style={styles.buttons}>
                        <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onClose}>
                            <Text style={styles.btnTextCancel}>Later</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.btn, styles.btnConfirm]} onPress={onOpenSettings}>
                            <Settings size={18} color="white" style={{ marginRight: 8 }} />
                            <Text style={styles.btnTextConfirm}>Open Settings</Text>
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
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        elevation: 10,
    },
    iconContainer: {
        backgroundColor: '#E8F5E9',
        padding: 16,
        borderRadius: 50,
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    description: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 22,
    },
    stepsContainer: {
        backgroundColor: '#F5F5F5',
        width: '100%',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    step: {
        fontSize: 14,
        color: '#444',
        marginBottom: 8,
    },
    buttons: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
    },
    btn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    btnCancel: {
        backgroundColor: '#F5F5F5',
    },
    btnConfirm: {
        backgroundColor: colors.primary,
    },
    btnTextCancel: {
        color: '#666',
        fontWeight: '600',
    },
    btnTextConfirm: {
        color: 'white',
        fontWeight: 'bold',
    },
});
