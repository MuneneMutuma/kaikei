import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { Category } from '../ledger/Schema';
import { parseMpesaMessage, MpesaTransaction } from '../../utils/mpesaParser';

export interface PayeeCandidate {
    name: string;
    count: number;
    sample?: MpesaTransaction | null;
    suggestedCategory?: string;
}

export class SmartOnboardingService {
    private repo: ExpenseRepository;

    constructor() {
        this.repo = new ExpenseRepository();
    }

    /**
     * Step 1: Find people you pay often who aren't categorized yet.
     */
    public getTopPayees(limit: number = 5): PayeeCandidate[] {
        const raw = this.repo.getFrequentRecipients(limit);
        return raw.map(r => {
            let sample = null;
            if (r.rawText) {
                sample = parseMpesaMessage(r.rawText);
            }
            return {
                name: r.recipient,
                count: r.count,
                sample
            };
        });
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
