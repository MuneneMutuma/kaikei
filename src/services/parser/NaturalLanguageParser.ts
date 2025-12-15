import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { Category, DEFAULT_CATEGORIES } from '../ledger/Schema';

export interface ParsedExpense {
    amount: number;
    description: string;
    categoryId: string;
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
            confidence: category.name === 'Other' ? 0.5 : 0.9
        };
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
