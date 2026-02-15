import { HfInference } from "@huggingface/inference";
import { HF_TOKEN } from "@env";

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
