import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { Category, Expense } from '../ledger/Schema';
import { parseMpesaMessage, MpesaTransaction } from '../../utils/mpesaParser';

export interface PayeeCandidate {
    name: string;
    count: number;
    sample?: MpesaTransaction | null;
    suggestedCategory?: string;
    transactions: Expense[];
}

export class SmartOnboardingService {
    private repo: ExpenseRepository;

    constructor() {
        this.repo = new ExpenseRepository();
    }

    /**
     * Step 1: Find people you pay often who aren't categorized yet.
     * LAZY LOADING: Returns metadata only. Details fetched on tap.
     */
    public async getTopPayees(limit: number = 5): Promise<PayeeCandidate[]> {
        const raw = this.repo.getFrequentRecipients(limit);

        const candidates: PayeeCandidate[] = [];

        for (const r of raw) {
            let sample = null;
            if (r.rawText) {
                sample = parseMpesaMessage(r.rawText);
                if (sample && r.sampleDate) {
                    sample.date = r.sampleDate;
                }
            }

            candidates.push({
                name: r.recipient,
                count: r.count,
                sample,
                transactions: [] // Empty = Lazy Load
            });
        }

        return candidates;
    }

    /**
     * Step 2: Fetch details when user taps the card
     */
    public async getTransactionsForRecipient(name: string): Promise<Expense[]> {
        return await this.repo.getUncategorizedExpensesByRecipient(name);
    }

    /**
     * Step 2: Apply the label to history AND future (via RAG context).
     */
    public async labelPayee(payeeName: string, categoryId: string): Promise<number> {
        return await this.repo.bulkUpdateCategory(payeeName, categoryId);
    }

    /**
     * Helper: Get available categories for the UI
     */
    public getCategories(): Category[] {
        return this.repo.getAllCategories();
    }
}
