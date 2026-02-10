import { HfInference } from "@huggingface/inference";
import { HF_TOKEN } from "@env";

// Initialize the client with the token from .env
const client = new HfInference(HF_TOKEN);

/**
 * Generates savings advice based on user categories
 * @param {string} userPersona - 'mama_mboga', 'bodaboda', or 'mochi'
 * @param {string} stats - Summary of expenses
 */
export const getAIAdvice = async (userPersona: string, stats: string): Promise<string> => {
    try {
        const response = await client.chatCompletion({
            // Qwen 2.5 7B is powerful and usually available on the free tier
            model: "Qwen/Qwen2.5-7B-Instruct",
            messages: [
                {
                    role: "system",
                    content: `You are a financial assistant for a ${userPersona} in Kenya. 
                    Give advice in English. Be practical and focus on saving money.`
                },
                {
                    role: "user",
                    content: `Here are my expenses this month: ${stats}. Give me top relevant short tips.`
                }
            ],
            max_tokens: 200, // SDK uses max_tokens, API sometimes max_new_tokens. HfInference normalizes this? 
            temperature: 0.7,
        });

        return response.choices[0].message.content || "No advice generated.";
    } catch (error) {
        console.error("HF Inference Error (Advice):", error);
        return "Pole, I can't give advice right now. Check your connection.";
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
        const catStr = categories.length > 0 ? categories.join(", ") : "Food, Transport, Rent, Utilities, Entertainment, Health, Shopping, Salary, Transfer, Other";
        const contextMsg = contextHint
            ? `Context: The user previously categorized this payment as '${contextHint}'. Prefer this category.`
            : "";

        const systemPrompt = `You are an expense assistant. Extract amount, category, and description. Categories: ${catStr}. ${contextMsg}\nFormat: JSON only.`;

        const response = await client.chatCompletion({
            model: "Qwen/Qwen2.5-72B-Instruct", // Using the big model for accuracy online
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Transaction: ${text}` }
            ],
            max_tokens: 100,
            temperature: 0.1,
            response_format: { type: "json_object" } // Qwen support for json_mode varies, but Instruct usually follows
        });

        const content = response.choices[0].message.content || "{}";
        // Extract JSON just in case
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
