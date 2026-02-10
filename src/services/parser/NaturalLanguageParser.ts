import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { Category } from '../ledger/Schema';
import { LlmClient } from '../llm/LlmClient';
import { ModelManager } from '../llm/ModelManager';

export interface ParsedExpense {
    amount: number;
    description: string;
    categoryId: string;
    categoryName?: string;
    confidence: number;
}

export class NaturalLanguageParser {
    private repo: ExpenseRepository;

    constructor() {
        this.repo = new ExpenseRepository();
    }

    /**
     * Predict category from text without requiring an amount.
     * Useful for importing expenses where amount is known.
     */
    public async predictCategory(text: string): Promise<Category> {
        return this.categorizeByKeywords(text);
    }

    /**
     * Parse a natural language string into an Expense object
     * @param text "Spent 500 on Shell for fuel"
     */
    public async parse(text: string): Promise<ParsedExpense | null> {
        const cleanedText = text.toLowerCase().trim();

        // 0. Try LLM First (The Brain)
        try {
            const isReady = await ModelManager.isModelReady();
            if (isReady) {
                console.log("Parser: LLM is ready, attempting to categorize...");
                const llmResult = await LlmClient.getInstance().categorize(text);

                if (llmResult.amount && llmResult.amount > 0 && llmResult.category) {
                    // Match category name to ID
                    const cat = this.matchCategoryName(llmResult.category);

                    console.log("Parser: LLM Success!", llmResult);
                    return {
                        amount: llmResult.amount,
                        description: llmResult.description || text,
                        categoryId: cat.id,
                        categoryName: cat.name,
                        confidence: 0.95
                    };
                }
            }
        } catch (e) {
            console.warn("Parser: LLM failed, falling back to regex", e);
        }

        // --- FALLBACK (Regex + Keywords) ---

        // 1. Extract Amount (Regex)
        // Matches: "500", "500 bob", "ksh 500", "500.50"
        const amountRegex = /(?:ksh|sh|bob)?\s?(\d+(?:,\d{3})*(?:\.\d{2})?)\s?(?:ksh|sh|bob)?/i;
        const amountMatch = cleanedText.match(amountRegex);

        if (!amountMatch) {
            console.log("No amount found in text:", text);
            return null;
        }

        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));

        // 2. Extract Description (Everything else)
        // Strategy: Remove the amount and common filler words
        let description = cleanedText
            .replace(amountMatch[0], '')
            .replace(/\b(spent|paid|bought|cost|at|on|for|in)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!description) description = "Unknown Expense";

        // 3. Categorize (Keyword Matching)
        const category = await this.categorizeByKeywords(description);

        return {
            amount,
            description,
            categoryId: category.id,
            categoryName: category.name,
            confidence: category.name === 'Other' ? 0.5 : 0.9
        };
    }

    private matchCategoryName(name: string): Category {
        const categories = this.repo.getAllCategories();
        // Exact match
        const exact = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (exact) return exact;

        // Partial match
        const partial = categories.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
        if (partial) return partial;

        // Default
        return categories.find(c => c.name === 'Other') || categories[0];
    }

    private async categorizeByKeywords(description: string): Promise<Category> {
        const categories = this.repo.getAllCategories();
        const words = description.split(/\s+/);

        for (const cat of categories) {
            for (const keyword of cat.keywords) {
                if (description.includes(keyword) || words.includes(keyword)) {
                    return cat;
                }
            }
        }

        // Fallback to 'Other'
        const otherCat = categories.find(c => c.name === 'Other');
        return otherCat || categories[0]; // Should verify 'Other' exists
    }
}
