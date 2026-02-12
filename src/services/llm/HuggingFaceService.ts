import { HfInference } from "@huggingface/inference";
import { HF_TOKEN } from "@env";

// Initialize the client with the token from .env
const client = new HfInference(HF_TOKEN);

/**
 * Generates savings advice based on user categories
 * @param {string} userPersona - 'Mama Mboga', 'Bodaboda', etc.
 * @param {object} financialSummary - Aggregated stats { totalIncome, totalExpense, topCategories }
 */
export const getAIAdvice = async (
    userPersona: string,
    financialSummary: { totalIncome: number, totalExpense: number, topCategories: { name: string, amount: number }[] }
): Promise<string> => {
    try {
        // Privacy Layer: Construct a generic summary string without PII
        const topCatsStr = financialSummary.topCategories
            .map(c => `${c.name}: ${c.amount.toLocaleString()}`)
            .join(', ');

        const statsStr = `Total Income: ${financialSummary.totalIncome.toLocaleString()}, Total Expense: ${financialSummary.totalExpense.toLocaleString()}. Top Expenses: ${topCatsStr}`;

        const response = await client.chatCompletion({
            model: "Qwen/Qwen2.5-7B-Instruct",
            messages: [
                {
                    role: "system",
                    content: `You are a savvy financial advisor in Kenya. Your client is a "${userPersona}".
                    Analyze their spending. Give 3 short, specific, culturally relevant tips in English mixed with a little Swahili (Sheng).
                    Focus on: cutting costs in their top expense categories, saving for emergencies, and growing business capital.
                    Keep it encouraging but firm.`
                },
                {
                    role: "user",
                    content: `Here is my financial summary for this month: ${statsStr}. What should I do?`
                }
            ],
            max_tokens: 350,
            temperature: 0.7,
        });

        return response.choices[0].message.content || "No advice generated.";
    } catch (error) {
        console.error("HF Inference Error (Advice):", error);
        return "Pole, connection issue. Please try again later.";
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
