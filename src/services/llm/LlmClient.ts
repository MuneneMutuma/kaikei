
import { initLlama, LlamaContext } from 'llama.rn';
import { ModelManager } from './ModelManager';
import { getPersonaPrompt } from './PersonaPrompts';
import { getStructuredAIAdvice, categorizeTransactionRemote } from './HuggingFaceService';

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
        console.log("LlmClient: init() called");
        try {
            const modelPath = ModelManager.getModelPath();
            console.log("LlmClient: Checking model readiness...");
            const isReady = await ModelManager.isModelReady();
            console.log(`LlmClient: Model ready status: ${isReady}`);

            if (!isReady) {
                // If local model is missing, we might need to warn or just rely on cloud if requested.
                // But for categorizedLocal, we fail.
                throw new Error("Local Model not downloaded");
            }

            console.log(`LlmClient: Attempting to load model from: ${modelPath}`);
            const stats = await require('react-native-fs').stat(modelPath);
            console.log(`LlmClient: Model file size: ${stats.size} bytes`);

            console.log("LlmClient: Calling initLlama backend...");
            this.context = await initLlama({
                model: modelPath,
                use_mlock: false, // Disabled to prevent native OOM/crashes
                n_ctx: 2048,
                n_gpu_layers: 0,
            });
            console.log("LlmClient: Context initialized successfully");
        } catch (e: any) {
            console.error("LlmClient: Init failed", e);
            throw e;
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Categorize Transaction (Privacy-First Local Default)
     * If local fails or is not ready, could fallback to cloud if enabled (future)
     */
    async categorize(text: string, availableCategories: string[] = [], contextHint?: string): Promise<{ amount?: number, category?: string, description?: string }> {
        console.log("LlmClient: Using Privacy-First Local Inference");
        return this.categorizeLocal(text, availableCategories, contextHint);
    }

    async generateCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
        if (!this.context) {
            await this.init();
        }
        if (!this.context) throw new Error("LLM Context failed to initialize");

        const prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;

        try {
            const response = await this.context.completion({
                prompt: prompt,
                n_predict: 500,
                temperature: 0.7,
                stop: ["<|im_end|>", "<|endoftext|>"]
            });
            console.log("LlmClient: Gen Result:", response.text);
            return response.text.trim();
        } catch (e) {
            console.error("LlmClient: Generation failed", e);
            throw e;
        }
    }

    /**
     * Generates structured advice with citations.
     * Supports switching between Local (Llama) and Cloud (HuggingFace).
     */
    async generateStructuredAdvice(persona: string, userPrompt: string, preferCloud: boolean = false): Promise<any> {

        // 1. CLOUD PATH
        if (preferCloud) {
            console.log("LlmClient: Using Cloud Inference (HuggingFace)...");
            return getStructuredAIAdvice(persona, userPrompt);
        }

        // 2. LOCAL PATH
        console.log("LlmClient: Using Local Inference (Llama)...");
        if (!this.context) {
            try {
                await this.init();
            } catch (e) {
                console.warn("LlmClient: Local init failed, falling back to Cloud if possible or fail.");
                // Optional: Fallback to cloud if local fails? 
                // For now, let's fail to respect "Local" preference unless we want auto-fallback.
                // Let's throw to inform UI.
                throw e;
            }
        }
        if (!this.context) throw new Error("LLM Context failed to initialize");

        const systemPrompt = getPersonaPrompt(persona);

        // STRICT JSON Schema for Local Model
        // Simplified for smaller models but explicit about Evidence
        const jsonSchema = `
        STRICT RULES:
        1. Output JSON ONLY.
        2. Do not invent numbers. Use ONLY numbers provided in the user prompt.
        3. MANDATORY: You MUST include at least one "citation" in the citations array.
        4. "citations" must use the EXACT category names from the input.

        Example Input: "Spent 5000 on Fuel"
        Example Output:
        {
          "advice": "Your Fuel spending of 5000 is high...",
          "citations": [
            { "type": "category", "id": "Fuel", "label": "Fuel: 5000" }
          ]
        }
        
        Format:
        {
          "advice": "Your advice text here...",
          "citations": [
            { "type": "category", "id": "ExactCategoryName", "label": "Short Verification" }
          ]
        }
        `;

        const prompt = `<|im_start|>system\n${systemPrompt}\n${jsonSchema}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n{`;

        try {
            const response = await this.context.completion({
                prompt: prompt,
                n_predict: 600,
                temperature: 0.1, // Very low temp for strict adherence
                stop: ["<|im_end|>", "<|endoftext|>"]
            });

            console.log("LlmClient: Local Raw Response:", response.text);
            const jsonStr = this.extractJson(response.text);
            console.log("LlmClient: Extracted JSON:", jsonStr);

            return JSON.parse(jsonStr);

        } catch (e) {
            console.error("LlmClient: Local Structured Generation failed", e);
            return null; // Return null so UI knows to not show anything or show error
        }
    }

    private async categorizeLocal(text: string, availableCategories: string[] = [], contextHint?: string): Promise<any> {
        let attempts = 0;
        const maxAttempts = 2;

        while (attempts < maxAttempts) {
            try {
                if (!this.context) await this.init();
                // Check again in case init failed
                if (!this.context) throw new Error("Context failed to load");

                const prompt = this.buildPrompt(text, availableCategories, contextHint, true);

                const response = await this.context.completion({
                    prompt: prompt,
                    n_predict: 80,
                    temperature: 0.1,
                    stop: ["<|im_end|>", "\n\n", "}"] // Stop earlier to save time
                });

                console.log("LlmClient: Local Result:", response.text);
                const jsonStr = this.extractJson(response.text);
                return JSON.parse(jsonStr);

            } catch (e) {
                console.error(`LlmClient: Local Inference attempt ${attempts + 1} failed`, e);
                attempts++;

                // If it was a native crash, the context might be dead. Force release.
                await this.release();

                if (attempts >= maxAttempts) {
                    return { category: null };
                }
                // Wait briefly before retry
                await new Promise(resolve => setTimeout(() => resolve(null), 500));
            }
        }
        return { category: null };
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
        const trimmed = output.trim();
        // If the model didn't start with {, we pre-filled it in the prompt, so we prepend it.
        // However, if the model repeated the {, we handle that.
        let combined = trimmed.startsWith('{') ? trimmed : "{" + trimmed;

        // Find first { and last }
        const first = combined.indexOf('{');
        const last = combined.lastIndexOf('}');

        if (first !== -1 && last !== -1) {
            return combined.substring(first, last + 1);
        }
        return combined;
    }

    async release() {
        if (this.context) {
            try {
                await this.context.release();
            } catch (e) {
                console.warn("Failed to release context", e);
            }
            this.context = null;
        }
    }
}
