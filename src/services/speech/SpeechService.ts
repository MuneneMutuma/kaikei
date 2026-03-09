export type SpeechEngineState = 'idle' | 'initializing' | 'listening' | 'processing' | 'error';
export type EngineType = 'gsr' | 'sherpa-whisper';

export interface SpeechResult {
    text: string;
    confidence?: number;
    language: 'en' | 'sw' | 'unknown';
    durationMs: number;
    engineType: EngineType;
    terminatedBy: 'user' | 'vad' | 'timeout' | 'error';
}

export interface SpeechEngineOptions {
    language: 'en' | 'sw';
    onStateChange?: (state: SpeechEngineState) => void;
    onPartial?: (text: string) => void;
    onFinal?: (result: SpeechResult) => void;
    onError?: (error: string, code?: number) => void;
    onMetering?: (db: number) => void;
}

export interface SpeechEngine {
    engineType: EngineType;
    isStreamingCapable: boolean;
    currentState: SpeechEngineState;

    startListening(options: SpeechEngineOptions): Promise<void>;
    stopListening(): Promise<SpeechResult>;
    cancelListening(): Promise<void>;
    destroy(): void;
}

/**
 * Service factory for acquiring the right engine based on language choice.
 */
let engines = new Map<EngineType, SpeechEngine>();

export function registerSpeechEngine(engine: SpeechEngine) {
    engines.set(engine.engineType, engine);
}

export function getSpeechEngine(type: EngineType): SpeechEngine {
    const engine = engines.get(type);
    if (!engine) {
        throw new Error(`Speech Engine ${type} is not registered`);
    }
    return engine;
}
