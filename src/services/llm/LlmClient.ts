import { initLlama, LlamaContext } from 'llama.rn';
import { ModelManager } from './ModelManager';
import { getPersonaPrompt } from './PersonaPrompts';

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
     * Returns: { advice: string, citations: Array<{ type: string, id: string, label: string }> }
     */
    async generateStructuredAdvice(persona: string, userPrompt: string): Promise<any> {
        if (!this.context) {
            await this.init();
        }
        if (!this.context) throw new Error("LLM Context failed to initialize");

        const systemPrompt = getPersonaPrompt(persona);

        // Force JSON structure and provide examples
        const jsonSchema = `
        ## Citation Rules:
        1. For EVERY financial observation, you MUST add a citation in the "citations" array.
        2. "type" must be "category". 
        3. "id" must be the EXACT category name (e.g., "Fuel", "Rent", "Groceries").
        4. "label" should be short and descriptive (e.g., "See Fuel (Ksh 50k)").
        
        ## Output Format:
        JSON ONLY. Example:
        {
          "advice": "I noticed your Rent (Ksh 50k) is the main driver...",
          "citations": [
            { "type": "category", "id": "Rent", "label": "See Rent (50k)" }
          ]
        }

        ## DATA RULES
        Do not cite any false data. You MUST use figures that are true from the input both in your advice and in your citations.
        `;

        const prompt = `<|im_start|>system\n${systemPrompt}\n${jsonSchema}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n{`;

        try {
            const response = await this.context.completion({
                prompt: prompt,
                n_predict: 800, // Increased for detailed advice
                temperature: 0.7, // Lower for more stable JSON
                stop: ["<|im_end|>", "<|endoftext|>"]
            });

            console.log("LlmClient: Raw Response:", response.text);
            const jsonStr = this.extractJson(response.text);
            console.log("LlmClient: Extracted JSON:", jsonStr);

            return JSON.parse(jsonStr);

        } catch (e) {
            console.error("LlmClient: Structured Generation failed", e);
            return {
                advice: "Failed to generate structured advice. Please try again.",
                citations: []
            };
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
                    n_predict: 60,
                    temperature: 0.1,
                    stop: ["<|im_end|>", "\n\n"]
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
        const combined = "{" + output;

        // Strategy 1: Try parsing raw (Model ignored prompt suffix and gave full JSON)
        try {
            JSON.parse(trimmed);
            return trimmed;
        } catch (e) { }

        // Strategy 2: Try parsing combined (Model respected prompt suffix)
        try {
            JSON.parse(combined);
            return combined;
        } catch (e) { }

        // Strategy 3: Heuristic Substring on Raw (Find buried JSON)
        try {
            const first = trimmed.indexOf('{');
            const last = trimmed.lastIndexOf('}');
            if (first !== -1 && last > first) {
                const sub = trimmed.substring(first, last + 1);
                JSON.parse(sub);
                return sub;
            }
        } catch (e) { }

        // Strategy 4: Heuristic Substring on Combined
        try {
            const first = combined.indexOf('{');
            const last = combined.lastIndexOf('}');
            if (first !== -1 && last > first) {
                const sub = combined.substring(first, last + 1);
                JSON.parse(sub);
                return sub;
            }
        } catch (e) { }

        // If all fail, return empty object to prevent crash
        console.warn("LlmClient: JSON extraction failed for all strategies.");
        return "{}";
    }

    async release() {
        if (this.context) {
            await this.context.release();
            this.context = null;
        }
    }
}
