import STTManager, { STTConfig, STTResult } from 'react-native-sherpa-onnx-offline-stt';
import { SpeechEngine, SpeechEngineOptions, SpeechEngineState, SpeechResult } from './SpeechService';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

export class SherpaOnnxEngine implements SpeechEngine {
    engineType = 'sherpa-whisper' as const;
    isStreamingCapable = false;
    currentState: SpeechEngineState = 'idle';

    private manager: STTManager;
    private options?: SpeechEngineOptions;
    private startTime: number = 0;

    constructor() {
        this.manager = new STTManager();
    }

    private changeState(state: SpeechEngineState) {
        this.currentState = state;
        if (this.options?.onStateChange) {
            this.options.onStateChange(state);
        }
    }

    private async copyAssetIfNeeded(filename: string): Promise<string> {
        if (Platform.OS !== 'android') return filename; // For iOS, handle differently if needed

        const destPath = `${RNFS.DocumentDirectoryPath}/${filename}`;
        try {
            const exists = await RNFS.exists(destPath);
            if (!exists) {
                console.log(`[Sherpa] Extracting asset ${filename} to ${destPath}`);
                // Assets path is relative to the `assets` folder
                await RNFS.copyFileAssets(`sherpa_models_base/${filename}`, destPath);
            }
            return destPath;
        } catch (e) {
            console.error(`[Sherpa] Failed to copy asset ${filename}`, e);
            throw e;
        }
    }

    async ensureInitialized() {
        if (this.manager.initialized) return;

        // Extract models from Android Assets folder to internal storage.
        // The underlying C++ JNI requires standard java.io.File paths, not asset:// URIs.
        const encoderPath = await this.copyAssetIfNeeded('base-encoder.int8.onnx');
        const decoderPath = await this.copyAssetIfNeeded('base-decoder.int8.onnx');
        const tokensPath = await this.copyAssetIfNeeded('base-tokens.txt');
        const vadModelPath = await this.copyAssetIfNeeded('silero_vad.onnx');

        // This is a Whisper Base setup for Sherpa-ONNX
        const config: STTConfig = {
            modelArchitecture: 'whisper',
            modelType: 'offline', // Whisper only supports offline batch inference
            encoderPath: encoderPath,
            decoderPath: decoderPath,
            tokensPath: tokensPath,
            whisperLanguage: 'sw', // Enforce Swahili instead of auto-detect

            vadModelPath: vadModelPath,
            vad: {
                threshold: 0.3, // Lower threshold = less strict, captures softer voices
                minSpeechDurationMs: 250,
                minSilenceDurationMs: 1500, // 1.5 seconds silence cutoff AFTER user starts speaking
                maxSpeechDurationMs: 30000,
                speechPaddingMs: 150,
                mode: 'normal'
            },

            sampleRate: 16000,
            provider: 'cpu',
        };

        try {
            await this.manager.initialize(config);
        } catch (e) {
            console.error("Sherpa Initialization failed", e);
            throw e;
        }
    }

    private hasSpoken = false;
    private initialSilenceTimeout?: ReturnType<typeof setTimeout>;

    async startListening(options: SpeechEngineOptions): Promise<void> {
        this.options = options;
        this.changeState('initializing');
        this.startTime = Date.now();
        this.hasSpoken = false;

        if (this.initialSilenceTimeout) {
            clearTimeout(this.initialSilenceTimeout);
        }

        try {
            await this.ensureInitialized();
        } catch (e) {
            this.changeState('error');
            if (options.onError) options.onError("Failed to initialize offline engine");
            throw e;
        }

        // Setup events
        this.manager.on('vad', (event) => {
            if (event.state === 'speech_start') {
                this.hasSpoken = true;
                if (this.initialSilenceTimeout) {
                    clearTimeout(this.initialSilenceTimeout);
                }
                this.changeState('listening'); // Ensure UI knows we heard them
            } else if (event.state === 'silence' && this.currentState === 'listening' && this.hasSpoken) {
                // If the user stops speaking (only AFTER they have actually started),
                // automatically transition to processing and resolve the recording batch.
                if (this.options?.onStateChange) {
                    this.changeState('processing');

                    setTimeout(() => {
                        if (this.currentState === 'processing') {
                            this.stopListening().then(result => {
                                if (this.options?.onFinal) {
                                    this.options.onFinal(result);
                                }
                            }).catch(e => console.error("Silent auto stop failed", e));
                        }
                    }, 50);
                }
            }
        });

        this.manager.on('error', (err) => {
            this.changeState('error');
            if (this.options?.onError) {
                this.options.onError(err.message || 'Offline recording error');
            }
        });

        try {
            await this.manager.startRecording();
            this.changeState('listening');

            // Start the 5-second initial silence grace-period timer
            this.initialSilenceTimeout = setTimeout(() => {
                if (!this.hasSpoken && this.currentState === 'listening') {
                    console.log("[SherpaOnnx] 5 seconds of initial silence reached. Auto-aborting.");
                    this.changeState('processing');
                    this.stopListening().then(result => {
                        if (this.options?.onFinal) {
                            this.options.onFinal(result);
                        }
                    }).catch(e => console.error("Initial silence auto abort failed", e));
                }
            }, 5000);

        } catch (e) {
            this.changeState('error');
            throw e;
        }
    }

    private stopPromiseResolve?: (value: SpeechResult) => void;
    private stopPromiseReject?: (reason?: any) => void;

    // Modified to act like a deferred promise if called early
    async stopListening(): Promise<SpeechResult> {
        this.changeState('processing');

        if (this.initialSilenceTimeout) {
            clearTimeout(this.initialSilenceTimeout);
            this.initialSilenceTimeout = undefined;
        }

        try {
            // This stops recording and returns the final batch result
            const results = await this.manager.stopRecording();
            this.cleanup();

            if (results && results.length > 0) {
                // VAD chunk might return multiple results; join them
                const finalTranscript = results.map(r => r.text).join(" ").trim();
                const totalProcessingTime = results.reduce((acc, r) => acc + r.processingTime, 0);

                const res: SpeechResult = {
                    text: finalTranscript,
                    confidence: results[0].confidence, // Take confidence of first block
                    language: 'sw', // Assume Swahili since we routed here
                    durationMs: Date.now() - this.startTime,
                    engineType: 'sherpa-whisper',
                    terminatedBy: 'vad',
                };

                if (this.stopPromiseResolve) this.stopPromiseResolve(res);
                return res;
            }

            const emptyRes: SpeechResult = {
                text: '',
                language: 'sw',
                durationMs: Date.now() - this.startTime,
                engineType: 'sherpa-whisper',
                terminatedBy: 'vad',
            };
            if (this.stopPromiseResolve) this.stopPromiseResolve(emptyRes);
            return emptyRes;

        } catch (e: any) {
            this.cleanup();
            if (e && e.code === "NOT_RECORDING") {
                const safeRes: SpeechResult = {
                    text: '', // If we already finalized, VoiceInput had already gotten it via VAD event
                    language: 'sw',
                    durationMs: Date.now() - this.startTime,
                    engineType: 'sherpa-whisper',
                    terminatedBy: 'vad',
                };
                if (this.stopPromiseResolve) this.stopPromiseResolve(safeRes);
                return safeRes;
            }
            this.changeState('error');
            if (this.stopPromiseReject) this.stopPromiseReject(e);
            throw e;
        }
    }

    async cancelListening(): Promise<void> {
        if (this.initialSilenceTimeout) {
            clearTimeout(this.initialSilenceTimeout);
            this.initialSilenceTimeout = undefined;
        }
        try {
            await this.manager.stopRecording();
        } catch (e) {
            // ignore
        } finally {
            this.cleanup();
            this.changeState('idle');
        }
    }

    destroy(): void {
        if (this.initialSilenceTimeout) {
            clearTimeout(this.initialSilenceTimeout);
            this.initialSilenceTimeout = undefined;
        }
        this.manager.removeAllListeners();
        this.manager.deinitialize();
    }

    private cleanup() {
        this.manager.removeAllListeners();
        if (this.currentState !== 'idle') {
            this.changeState('idle');
        }
    }
}
