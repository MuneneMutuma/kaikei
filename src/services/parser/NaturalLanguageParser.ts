import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { Category } from '../ledger/Schema';
import { LlmClient } from '../llm/LlmClient';
import { ModelManager } from '../llm/ModelManager';
import { categorizeTransactionRemote } from '../llm/HuggingFaceService';
import { findBestMatch } from '../../utils/fuzzy';

export interface ParsedExpense {
    amount: number;
    description: string;
    categoryId: string;
    categoryName?: string;
    confidence: number;
    method: 'fuzzy' | 'llm-local' | 'llm-cloud' | 'regex';
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

        // 1. EXTRACT AMOUNT (Regex First - Trust Math)
        const amountRegex = /(?:ksh|sh|bob)?\s?(\d+(?:,\d{3})*(?:\.\d{2})?)\s?(?:ksh|sh|bob)?/i;
        const amountMatch = cleanedText.match(amountRegex);
        let amount = 0;
        let description = cleanedText;

        if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(/,/g, ''));
            // Remove amount from description
            description = cleanedText
                .replace(amountMatch[0], '')
                .replace(/\b(spent|paid|bought|cost|at|on|for|in)\b/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        if (!description) description = "Unknown Expense";

        // 2. FUZZY MATCH (Fastest - Trust Intent)
        // Check description against Category Names & Keywords
        const localMatch = await this.categorizeByFuzzyOrKeyword(description);

        // If we have a High Confidence match (Direct keyword or very close fuzzy)
        if (localMatch.confidence > 0.8) {
            console.log(`[Parser] ⚡ MATCH: FUZZY/KEYWORD "${description}" -> ${localMatch.category.name}`);
            return {
                amount,
                description,
                categoryId: localMatch.category.id,
                categoryName: localMatch.category.name,
                confidence: localMatch.confidence,
                method: 'fuzzy'
            };
        }

        // 3. LLM FALLBACK (Smartest - Trust Semantic)
        // If Fuzzy failed/uncertain, ask the AI
        try {
            console.log("Parser: Fuzzy uncertain, asking LLM...");
            const cats = await this.repo.getAllCategories();
            const catNames = cats.map(c => c.name);

            const isReady = await ModelManager.isModelReady();
            if (isReady) {
                console.log("[Parser] 🤖 Local LLM Ready. Attempting inference...");
                const llmResult = await LlmClient.getInstance().categorize(text);

                if (llmResult.amount && llmResult.amount > 0 && llmResult.category) {
                    // Match category name to ID
                    const cat = await this.matchCategoryName(llmResult.category);

                    console.log(`[Parser] 🧠 MATCH: LOCAL LLM "${text}" -> ${cat.name}`);
                    return {
                        amount: llmResult.amount,
                        description: llmResult.description || text,
                        categoryId: cat.id,
                        categoryName: cat.name,
                        confidence: 0.95,
                        method: 'llm-local'
                    };
                }
            } else {
                console.log("[Parser] ⚠️ Local LLM Not Ready/Downloaded. Skipping local LLM.");
            }

            // If local LLM didn't provide a result or wasn't ready, try remote
            // tailored for "Concise" prompt
            const llmResultRemote = await categorizeTransactionRemote(text, catNames);

            if (llmResultRemote.category) {
                const cat = await this.matchCategoryName(llmResultRemote.category);
                console.log(`[Parser] 🧠 MATCH: REMOTE LLM "${text}" -> ${cat.name}`);
                return {
                    amount: llmResultRemote.amount || amount, // LLM might correct amount
                    description: llmResultRemote.description || description,
                    categoryId: cat.id,
                    categoryName: cat.name,
                    confidence: 0.95,
                    method: 'llm-cloud'
                };
            }
        } catch (e) {
            console.warn("Parser: LLM Fallback failed", e);
        }

        // 4. FINAL FALLBACK (Return best guess from Fuzzy/Keyword)
        console.log(`[Parser] ⚠️ FALLBACK: REGEX/KEYWORD "${description}" -> ${localMatch.category.name}`);
        return {
            amount,
            description,
            categoryId: localMatch.category.id,
            categoryName: localMatch.category.name,
            confidence: localMatch.confidence,
            method: 'regex'
        };
    }

    private async categorizeByFuzzyOrKeyword(description: string): Promise<{ category: Category, confidence: number }> {
        const categories = await this.repo.getAllCategories();

        // Prepare list for fuzzy matching: "CategoryName" + "Keywords"
        // We map flattened keywords back to categories

        for (const cat of categories) {
            // A. Exact/Phrase Match in Keywords (Fastest)
            for (const keyword of cat.keywords) {
                const kw = keyword.toLowerCase().trim();
                if (!kw) continue;
                // strict word boundary for short keywords, lenient for long
                if (kw.length < 4) {
                    if (new RegExp(`\\b${kw}\\b`, 'i').test(description)) return { category: cat, confidence: 1.0 };
                } else {
                    if (description.includes(kw)) return { category: cat, confidence: 1.0 };
                }
            }
        }

        // B. Fuzzy Match on specific words in description
        // "I paid for Contribtion" -> "Consumption"? "Contribution"?
        const words = description.split(/\s+/);

        // We match description words against Category Names (Priority)
        const categoryNames = categories.map(c => c.name);
        for (const word of words) {
            if (word.length < 3) continue;

            const match = findBestMatch(word, categoryNames, 2); // Strict threshold 2
            if (match) {
                console.log(`Parser: Fuzzy Match "${word}" -> "${match.match}"`);
                const cat = categories.find(c => c.name === match.match);
                if (cat) return { category: cat, confidence: 0.9 };
            }
        }

        // C. Default
        return { category: categories.find(c => c.name === 'Other') || categories[0], confidence: 0.5 };
    }

    private async matchCategoryName(name: string): Promise<Category> {
        const categories = await this.repo.getAllCategories();
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
        const categories = await this.repo.getAllCategories();
        const words = description.split(/\s+/);

        for (const cat of categories) {
            for (const keyword of cat.keywords) {
                const kw = keyword.toLowerCase().trim();
                if (!kw) continue;

                // 1. Exact word match (Using word boundaries)
                const regex = new RegExp(`\\b${kw}\\b`, 'i');
                if (regex.test(description)) {
                    console.log(`Parser: Matched Category "${cat.name}" via keyword "${kw}"`);
                    return cat;
                }

                // 2. Inclusion match for compound words (e.g. "airtime" in "buyairtime")
                if (description.includes(kw)) {
                    console.log(`Parser: Partial hit on "${cat.name}" via "${kw}"`);
                    return cat;
                }
            }
        }

        // Fallback to 'Other'
        const otherCat = categories.find(c => c.name === 'Other');
        return otherCat || categories[0]; // Should verify 'Other' exists
    }
}
