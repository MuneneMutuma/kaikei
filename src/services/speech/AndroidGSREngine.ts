import { NativeModules, NativeEventEmitter } from 'react-native';
import { SpeechEngine, SpeechEngineOptions, SpeechEngineState, SpeechResult } from './SpeechService';

const { VoiceModule } = NativeModules;
const voiceEmitter = new NativeEventEmitter(VoiceModule);

export class AndroidGSREngine implements SpeechEngine {
    engineType = 'gsr' as const;
    isStreamingCapable = true;
    currentState: SpeechEngineState = 'idle';

    private options?: SpeechEngineOptions;
    private startTime: number = 0;
    private startListener?: any;
    private resultListener?: any;
    private errorListener?: any;

    // We store the promise resolvers to resolve stopListening() natively
    private resolveStop?: (result: SpeechResult) => void;
    private rejectStop?: (reason: any) => void;

    // Latest transcript we got
    private lastTranscript: string = '';

    private changeState(state: SpeechEngineState) {
        this.currentState = state;
        if (this.options?.onStateChange) {
            this.options.onStateChange(state);
        }
    }

    private endListener?: any;
    private recognizedListener?: any;

    async startListening(options: SpeechEngineOptions): Promise<void> {
        if (!VoiceModule) {
            throw new Error("VoiceModule not found");
        }

        this.options = options;
        this.changeState('initializing');
        this.startTime = Date.now();
        this.lastTranscript = '';

        this.startListener = voiceEmitter.addListener('onSpeechStart', () => {
            this.changeState('listening');
        });

        this.resultListener = voiceEmitter.addListener('onSpeechResults', (e: any) => {
            if (e.value && e.value.length > 0) {
                const text = e.value[0];
                this.lastTranscript = text;
                if (this.options?.onPartial) {
                    this.options.onPartial(text);
                }

                // If Android natively completed listening and is now processing,
                // automatically trigger the UI's final parser when the result arrives.
                if (this.currentState === 'processing') {
                    if (this.options?.onFinal) {
                        this.options.onFinal({
                            text: text,
                            confidence: undefined,
                            language: 'en',
                            durationMs: Date.now() - this.startTime,
                            engineType: 'gsr',
                            terminatedBy: 'vad',
                        });
                    }
                    this.cleanup();
                }

                // If we were waiting for stop to resolve (manual stop)
                if (this.resolveStop) {
                    this.resolveStop({
                        text: text,
                        confidence: 100, // GSR doesn't often provide this natively in this setup
                        language: 'en',
                        durationMs: Date.now() - this.startTime,
                        engineType: 'gsr',
                        terminatedBy: 'vad',
                    });
                    this.cleanup();
                }
            }
        });

        // Add auto-stop handlers when Android natively detects the end of speech
        const handleNativeSpeechEnd = () => {
            // Android GSR automatically transitions to cloud-processing after this event.
            // We do NOT call `stopListening()` here because it cancels the API request!
            // We just update the UI state to 'processing' and wait for `onSpeechResults`
            if (this.currentState === 'listening') {
                this.changeState('processing');
            }
        };

        this.endListener = voiceEmitter.addListener('onSpeechEnd', handleNativeSpeechEnd);
        this.recognizedListener = voiceEmitter.addListener('onSpeechRecognized', handleNativeSpeechEnd);

        this.errorListener = voiceEmitter.addListener('onSpeechError', (e: any) => {
            this.changeState('error');
            if (this.options?.onError) {
                this.options.onError(e.message || "Voice recording failed", e.code);
            }
            if (this.rejectStop) {
                this.rejectStop(new Error(`Voice Error: ${e.code}`));
                this.cleanup();
            }
        });

        try {
            await VoiceModule.startListening({
                locale: '',
                preferOffline: true
            });
        } catch (e) {
            this.changeState('error');
            throw e;
        }
    }

    async stopListening(): Promise<SpeechResult> {
        this.changeState('processing');

        return new Promise((resolve, reject) => {
            this.resolveStop = resolve;
            this.rejectStop = reject;

            VoiceModule.stopListening().catch((e: any) => {
                // If it throws an error while stopping, it usually means it already 
                // stopped natively due to silence. Since we already have the transcript,
                // we gracefully resolve instead of throwing an error to the UI.
                if (this.resolveStop) {
                    this.resolveStop({
                        text: this.lastTranscript,
                        confidence: undefined,
                        language: 'en',
                        durationMs: Date.now() - this.startTime,
                        engineType: 'gsr',
                        terminatedBy: 'vad',
                    });
                    this.cleanup();
                }
            });

            // Timeout fallback in case GSR never returns onSpeechResults after stop
            setTimeout(() => {
                if (this.resolveStop) {
                    this.resolveStop({
                        text: this.lastTranscript,
                        confidence: undefined,
                        language: 'en',
                        durationMs: Date.now() - this.startTime,
                        engineType: 'gsr',
                        terminatedBy: 'timeout', // Wait timeout
                    });
                    this.cleanup();
                }
            }, 3000);
        });
    }

    async cancelListening(): Promise<void> {
        try {
            await VoiceModule.stopListening();
        } catch (e) {
            // Ignore cancel errors
        } finally {
            this.changeState('idle');
            this.cleanup();
        }
    }

    destroy(): void {
        this.cleanup();
    }

    private cleanup() {
        if (this.startListener) this.startListener.remove();
        if (this.resultListener) this.resultListener.remove();
        if (this.errorListener) this.errorListener.remove();
        if (this.endListener) this.endListener.remove();
        if (this.recognizedListener) this.recognizedListener.remove();

        this.startListener = undefined;
        this.resultListener = undefined;
        this.errorListener = undefined;
        this.endListener = undefined;
        this.recognizedListener = undefined;

        this.resolveStop = undefined;
        this.rejectStop = undefined;

        if (this.currentState !== 'idle') {
            this.changeState('idle');
        }
    }
}
