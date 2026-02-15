import { initLlama, LlamaContext } from 'llama.rn';
import { ModelManager } from './ModelManager';
import { categorizeTransactionRemote } from './HuggingFaceService';

export class LlmClient {
    private static instance: LlmClient;
    private context: LlamaContext | null = null;
    private isInitializing = false;

    private constructor() { }

    static getInstance(): LlmClient {
        if (!LlmClient.instance) {
            LlmClient.instance = new LlmClient();
        }
        return LlmClient.instance;
    }

    async init(): Promise<void> {
        if (this.context) return;
        if (this.isInitializing) return;

        this.isInitializing = true;
        try {
            const modelPath = ModelManager.getModelPath();
            const isReady = await ModelManager.isModelReady();

            if (!isReady) {
                // If we are strictly offline, this is fatal. 
                // In hybrid, we might survive if online, but we want local fallback always.
                throw new Error("Local Model not downloaded");
            }

            console.log(`LlmClient: Attempting to load model from: ${modelPath}`);
            const stats = await require('react-native-fs').stat(modelPath);
            console.log(`LlmClient: Model file size: ${stats.size} bytes`);

            this.context = await initLlama({
                model: modelPath,
                use_mlock: true,
                n_ctx: 2048,
                n_gpu_layers: 0,
            });
            console.log("LlmClient: Context initialized");
        } catch (e: any) {
            console.error("LlmClient: Init failed", e.message);
            throw e;
        } finally {
            this.isInitializing = false;
        }
    }

    async categorize(text: string, availableCategories: string[] = [], contextHint?: string): Promise<{ amount?: number, category?: string, description?: string }> {
        // Privacy First: Use Local Model (Qwen 0.5B) by default.
        // Cloud inference is available via HuggingFaceService for specific user-initiated actions.
        console.log("LlmClient: Using Privacy-First Local Inference");
        return this.categorizeLocal(text, availableCategories, contextHint);
    }

    async generateCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
        if (!this.context) {
            await this.init();
        }
        if (!this.context) throw new Error("LLM Context failed to initialize");

        // Format for Qwen 2.5 ChatML
        const prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;

        try {
            const response = await this.context.completion({
                prompt: prompt,
                n_predict: 500, // Longer for detailed advice
                temperature: 0.7, // Higher creativity for advice
                stop: ["<|im_end|>", "<|endoftext|>"]
            });
            console.log("LlmClient: Gen Result:", response.text);
            return response.text.trim();
        } catch (e) {
            console.error("LlmClient: Generation failed", e);
            throw e;
        }
    }

    private async categorizeLocal(text: string, availableCategories: string[] = [], contextHint?: string): Promise<any> {
        if (!this.context) {
            await this.init();
        }
        if (!this.context) throw new Error("LLM Context failed to initialize");

        const prompt = this.buildPrompt(text, availableCategories, contextHint, true);

        try {
            const response = await this.context.completion({
                prompt: prompt,
                n_predict: 60,
                temperature: 0.1, // Low temp for classification
                stop: ["<|im_end|>", "\n\n"]
            });
            console.log("LlmClient: Local Result:", response.text);
            const jsonStr = this.extractJson(response.text);
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("LlmClient: Local Inference failed", e);
            return { category: null };
        }
    }

    private buildPrompt(text: string, categories: string[], contextHint?: string, useChatML = true): string {
        const catStr = categories.length > 0 ? categories.join(", ") : "Food, Transport, Rent, Utilities, Entertainment, Health, Shopping, Salary, Transfer, Other";
        const contextMsg = contextHint
            ? `Context: The user previously categorized this payment as '${contextHint}'. Prefer this category.`
            : "";

        const system = `You are an expense assistant. Extract amount, category, and description. Categories: ${catStr}. ${contextMsg}\nFormat: JSON only.`;
        const user = `Transaction: ${text}`;

        return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n{`;
    }

    private extractJson(output: string): string {
        let fullStr = "{" + output;

        // Sanitize: sometimes models repeat the prompt or add chatter.
        // We look for the FIRST '{' and the LAST '}'
        const firstBrace = fullStr.indexOf('{');
        const lastBrace = fullStr.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return fullStr.substring(firstBrace, lastBrace + 1);
        }
        return "{}";
    }

    async release() {
        if (this.context) {
            await this.context.release();
            this.context = null;
        }
    }
}
