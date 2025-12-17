import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ModelManager, MODEL_CONFIG } from '../services/llm/ModelManager';

const ModelDownloadScreen = () => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<string>('Checking model...');
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        const ready = await ModelManager.isModelReady();
        setIsReady(ready);
        setStatus(ready ? 'Model Ready ✅' : 'Model Missing ❌');
        setProgress(ready ? 1 : 0);
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        setStatus('Downloading... (This may take a while)');
        try {
            await ModelManager.downloadModel((p) => {
                setProgress(p);
                // Update status text every 10% or so to reduce renders if needed, 
                // but React handles this mostly fine.
                setStatus(`Downloading... ${(p * 100).toFixed(0)}%`);
            });
            setStatus('Download Complete! Verifying...');
            await checkStatus();
            Alert.alert("Success", "AI Brain installed successfully!");
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
            Alert.alert("Download Failed", e.message);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDelete = async () => {
        Alert.alert(
            "Delete Model?",
            "Are you sure you want to delete the AI model? You will lose smart features until you download it again.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        await ModelManager.deleteModel();
                        await checkStatus();
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🧠 Expense AI Brain</Text>

            <View style={styles.card}>
                <Text style={styles.info}>
                    To categorize expenses automatically, we need to download a smart model (Llama 3.2).
                </Text>
                <Text style={styles.spec}>Size: ~{(MODEL_CONFIG.size / 1024 / 1024).toFixed(0)} MB</Text>

                <Text style={[styles.status, { color: isReady ? 'green' : isDownloading ? 'orange' : 'red' }]}>
                    Status: {status}
                </Text>

                {/* Custom Progress Bar */}
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
                </View>
                <Text style={styles.progressText}>{(progress * 100).toFixed(0)}%</Text>
            </View>

            <View style={styles.actions}>
                {!isReady && !isDownloading && (
                    <TouchableOpacity style={styles.button} onPress={handleDownload}>
                        <Text style={styles.buttonText}>⬇️ Download Model</Text>
                    </TouchableOpacity>
                )}

                {isReady && (
                    <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={handleDelete}>
                        <Text style={styles.buttonText}>🗑️ Delete Model</Text>
                    </TouchableOpacity>
                )}

                {isDownloading && (
                    <TouchableOpacity style={[styles.button, styles.disabled]} disabled>
                        <Text style={styles.buttonText}>Downloading...</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#fff',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#333',
    },
    card: {
        backgroundColor: '#f5f5f5',
        padding: 20,
        borderRadius: 10,
        width: '100%',
        alignItems: 'center',
        marginBottom: 30,
    },
    info: {
        textAlign: 'center',
        color: '#555',
        marginBottom: 10,
        lineHeight: 22,
    },
    spec: {
        fontWeight: 'bold',
        color: '#666',
        marginBottom: 10,
    },
    status: {
        fontWeight: 'bold',
        fontSize: 16,
        marginTop: 10,
    },
    progressBarContainer: {
        width: '100%',
        height: 10,
        backgroundColor: '#e0e0e0',
        borderRadius: 5,
        marginTop: 20,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#2196F3',
    },
    progressText: {
        marginTop: 5,
        color: '#666',
        fontSize: 12,
    },
    actions: {
        width: '100%',
        alignItems: 'center',
    },
    button: {
        backgroundColor: '#2196F3',
        paddingVertical: 15,
        paddingHorizontal: 40,
        borderRadius: 30,
        elevation: 3,
        width: '80%',
        alignItems: 'center',
    },
    deleteButton: {
        backgroundColor: '#e53935',
    },
    disabled: {
        backgroundColor: '#ccc',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default ModelDownloadScreen;
