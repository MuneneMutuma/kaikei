import { HfInference } from "@huggingface/inference";
import { HF_TOKEN } from "@env";
import { getPersonaPrompt } from "./PersonaPrompts";

// Initialize the client with the token from .env
const client = new HfInference(HF_TOKEN);

/**
 * Generates savings advice based on user categories
 * @param {string} userPersona - 'Mama Mboga', 'Bodaboda', etc.
 * @param {object} financialSummary - Aggregated stats { totalIncome, totalExpense, topCategories }
 */
export interface AdviceItem {
    id: string;
    title: string;
    advice: string;
    category: string | null;
}

/**
 * Generates savings advice based on user categories (Natural Language)
 * @param {string} userPersona - 'Mama Mboga', 'Bodaboda', etc.
 * @param {object} financialSummary - Aggregated stats { totalIncome, totalExpense, topCategories }
 */
export const getAIAdvice = async (
    userPersona: string,
    financialSummary: { totalIncome: number, totalExpense: number, topCategories: { name: string, amount: number }[] },
    historyContext?: string
): Promise<string> => {
    try {
        const topCatsStr = financialSummary.topCategories
            .map(c => `${c.name}: ${c.amount.toLocaleString()}`)
            .join(', ');

        const statsStr = `Total Income: ${financialSummary.totalIncome.toLocaleString()}, Total Expense: ${financialSummary.totalExpense.toLocaleString()}. Top Expenses: ${topCatsStr}`;
        const contextStr = historyContext ? `\n\nHistorical Context:\n${historyContext}` : "";

        const systemPrompt = `You are a senior financial analyst in Kenya. Your client is a "${userPersona}".
        Your goal is to provide specific, actionable advice to cut costs and increase savings.

        Rules:
        1. Ground your advice in the provided data. CITE SPECIFIC NUMBERS.
        2. Avoid generic platitudes. Be specific: "Reduce transport by 2K".
        3. Use a friendly but professional tone (English).
        4. Structure your response:
           - Observation: What is the biggest issue? (Cite the number)
           - Cause: Why is this happening?
           - Action: What specifically should the user do?`;

        const response = await client.chatCompletion({
            model: "Qwen/Qwen2.5-7B-Instruct",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Here is my summary: ${statsStr}.${contextStr} What should I do?` }
            ],
            max_tokens: 500,
            temperature: 0.7,
        });

        return response.choices[0].message.content || "No advice generated.";

    } catch (error) {
        console.error("HF Inference Error (Advice):", error);
        throw error; // Let screen handle error
    }
};

/**
 * Generates structured advice with citations (Cloud)
 */
export const getStructuredAIAdvice = async (
    persona: string,
    userPrompt: string
): Promise<any> => {
    try {
        const systemPrompt = getPersonaPrompt(persona);

        // Structure rules for JSON output
        const structureNote = `
        IMPORTANT: Your entire response MUST be valid JSON.
        
        ## DATA RULES (CRITICAL):
        1. Do not cite false data. Use figures that are true from the input only.
        2. You MUST provide at least one citation in the "citations" array.
        3. Citations act as "Evidence Pills" in the UI. They must be short.

        Example:
        {
          "advice": "You spent 500 on Airtime which is high compared to...",
          "citations": [
             { "type": "category", "id": "Airtime", "label": "Airtime: 500" }
          ]
        }
        `;

        const response = await client.chatCompletion({
            model: "Qwen/Qwen2.5-7B-Instruct",
            messages: [
                { role: "system", content: `${systemPrompt}\n${structureNote}` },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 800,
            temperature: 0.7,
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content || "{}";
        console.log("Cloud AI: Raw response:", content);

        // Robust extraction (same logic as LlmClient but simplified for json_object mode)
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            return JSON.parse(content.substring(firstBrace, lastBrace + 1));
        }
        return JSON.parse(content);

    } catch (error) {
        console.error("HF Structured Advice Error:", error);
        return {
            advice: "Cloud AI failed to process your request. Please check connection.",
            citations: []
        };
    }
};

/**
 * Categorizes a transaction string using the Cloud Model
 * @param text The transaction description (e.g. "Sent 500 to John")
 * @param categories List of valid categories
 * @param contextHint Previous category hint
 */
export const categorizeTransactionRemote = async (text: string, categories: string[], contextHint?: string): Promise<{ amount?: number, category?: string, description?: string }> => {
    try {
        const catStr = categories.length > 0 ? categories.join(",") : "Food,Transport,Rent,Utilities,Entertainment,Health,Shopping,Salary,Transfer,Other";

        // CONCISE PROMPT FOR SPEED
        const systemPrompt = `Classify expense. Return JSON.
Categories: [${catStr}]
Context: ${contextHint || 'None'}
Format: {"category": "String", "amount": Number, "description": "String"}`;

        const response = await client.chatCompletion({
            model: "Qwen/Qwen2.5-72B-Instruct",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            max_tokens: 60, // Very tight token limit for speed
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content || "{}";
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            return JSON.parse(content.substring(firstBrace, lastBrace + 1));
        }
        return JSON.parse(content);

    } catch (error) {
        console.error("HF Inference Error (Categorization):", error);
        throw error;
    }
}
