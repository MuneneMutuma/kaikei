import { initLlama, LlamaContext } from 'llama.rn';
import { ModelManager } from './ModelManager';

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
        if (this.isInitializing) return; // simple guard

        this.isInitializing = true;
        try {
            const modelPath = ModelManager.getModelPath();
            const isReady = await ModelManager.isModelReady();

            if (!isReady) {
                throw new Error("Model not downloaded");
            }

            this.context = await initLlama({
                model: modelPath,
                use_mlock: true, // Lock memory to prevent swapping
                n_ctx: 2048,     // Context window
                n_gpu_layers: 0, // 0 for CPU (safer on unknown Android GPU support)
            });
            console.log("LlmClient: Context initialized");
        } catch (e) {
            console.error("LlmClient: Init failed", e);
            throw e;
        } finally {
            this.isInitializing = false;
        }
    }

    async categorize(text: string): Promise<{ amount?: number, category?: string, description?: string }> {
        if (!this.context) {
            await this.init();
        }
        if (!this.context) throw new Error("LLM Context failed to initialize");

        const prompt = this.buildPrompt(text);

        try {
            const result = await this.context.completion({
                prompt: prompt,
                n_predict: 200,
                temperature: 0.2, // Low temp for deterministic JSON
                stop: ["<|eot_id|>", "}"], // Stop at JSON end
            });

            const jsonStr = this.extractJson(result.text);
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("LlmClient: Inference failed", e);
            return {};
        }
    }

    private buildPrompt(text: string): string {
        // Llama 3 Chat Template
        return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are an expense assistant. Extract amount, category, and description from the user input. Return ONLY JSON.
Categories: Food, Transport, Rent, Utilities, Entertainment, Health, Shopping, Salary, Transfer, Other.
Example: "I spent 500 on lunch" -> {"amount": 500, "category": "Food", "description": "lunch"}
Example: "Fare to town 100 bob" -> {"amount": 100, "category": "Transport", "description": "Fare to town"}<|eot_id|><|start_header_id|>user<|end_header_id|>

${text}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

{`;  // Pre-seed the JSON start
    }

    private extractJson(output: string): string {
        // Since we pre-seeded '{', add it back
        let fullStr = "{" + output;
        // Fix common JSON issues if LLM chatters
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
