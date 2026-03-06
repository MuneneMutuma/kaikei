import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ModelManager, MODEL_CONFIG } from '../services/llm/ModelManager';

const ModelDownloadScreen = () => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<string>('Checking model...');
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Check if we can recover a background download
        ModelManager.resumeDownloadIfActive();

        checkStatus();

        // Subscribe to background download progress
        const unsubscribe = ModelManager.addListener((state) => {
            setIsDownloading(state.isDownloading);
            setProgress(state.progress);
            if (state.isDownloading) {
                setStatus(`Downloading... ${(state.progress * 100).toFixed(0)}%`);
            } else if (state.progress >= 1) {
                setStatus('Download Complete! Verifying...');
                checkStatus(); // Re-verify file
            }
        });

        return () => { unsubscribe(); };
    }, []);

    const checkStatus = async () => {
        const ready = await ModelManager.isModelReady();
        setIsReady(ready);
        if (!isDownloading && ready) {
            setStatus('Model Ready ✅');
            setProgress(1);
        } else if (!isDownloading && !ready) {
            setStatus('Model Missing ❌');
        }
    };

    const handleDownload = async () => {
        if (isDownloading) return;
        try {
            await ModelManager.downloadModel();
            // Alert is handled by effect when complete? 
            // Or we can await here too, but listener handles UI.
            // await ModelManager.downloadModel() returns when done.
            Alert.alert("Success", "AI Brain installed successfully!");
        } catch (e: any) {
            // Error state handled by catch
            setStatus(`Error: ${e.message}`);
            Alert.alert("Download Failed", e.message);
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
                    To categorize expenses automatically, we need to download a smart model (Qwen 2.5 0.5B).
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
                    <>
                        <TouchableOpacity style={[styles.button, styles.testButton]} onPress={async () => {
                            try {
                                setStatus("Testing Model Load...");
                                const { LlmClient } = require('../services/llm/LlmClient');
                                await LlmClient.getInstance().init();
                                Alert.alert("Success", "Model loaded successfully!");
                                setStatus("Model Loaded OK ✅");
                            } catch (e: any) {
                                Alert.alert("Load Failed", e.message);
                                setStatus(`Load Error: ${e.message}`);
                            }
                        }}>
                            <Text style={styles.buttonText}>🧪 Test Load</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={handleDelete}>
                            <Text style={styles.buttonText}>🗑️ Delete Model</Text>
                        </TouchableOpacity>
                    </>
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
        marginTop: 10,
    },
    testButton: {
        backgroundColor: '#4CAF50',
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
