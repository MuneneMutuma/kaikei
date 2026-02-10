import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { LlmClient } from '../llm/LlmClient';
import { ModelManager } from '../llm/ModelManager';

export class AutoClassifier {
    private static instance: AutoClassifier;
    private repo: ExpenseRepository;
    private isRunning = false;
    private listeners: Set<(status: string, processing: boolean) => void> = new Set();

    private constructor() {
        this.repo = new ExpenseRepository();
    }

    public static getInstance(): AutoClassifier {
        if (!this.instance) {
            this.instance = new AutoClassifier();
        }
        return this.instance;
    }

    public addListener(cb: (status: string, processing: boolean) => void) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    private notify(status: string, processing: boolean) {
        this.listeners.forEach(cb => cb(status, processing));
    }

    public start() {
        if (this.isRunning) return;
        console.log("AutoClassifier: Started");
        this.isRunning = true;
        this.processNext();
    }

    public stop() {
        this.isRunning = false;
        this.notify('Paused', false);
    }

    private consecutiveFailures = 0;
    private readonly MAX_FAILURES = 5;
    private failedIds = new Set<string>(); // Skip items we can't handle this session

    private async processNext() {
        if (!this.isRunning) return;

        // 1. Check Model
        const isReady = await ModelManager.isModelReady();
        if (!isReady) {
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= 3) {
                this.notify('Model not ready. Paused.', false);
                this.isRunning = false;
                return;
            }
            this.notify('Waiting for AI Model...', false);
            setTimeout(() => this.processNext(), 10000);
            return;
        }

        // 2. Fetch candidates (Batch size 10 to skip failed ones)
        const candidates = this.repo.getUncategorizedExpenses(10);

        // Find first candidate not in failed list
        const expense = candidates.find(c => !this.failedIds.has(c.id));

        if (!expense) {
            this.notify('All Caught Up!', false);
            this.isRunning = false;
            this.consecutiveFailures = 0;
            return;
        }

        this.notify(`Classifying: ${expense.description.slice(0, 20)}...`, true);

        try {
            // 3. RAG: Check Header / Context
            let contextHint = undefined;
            let isTrusted = false;

            // Strategy: Use parsed recipient first, fallback to Regex extraction
            let recipientName = expense.recipient;
            if (!recipientName || recipientName === 'Unknown') {
                const match = expense.description.match(/Paid to (.+?)( on \d+|$)/i);
                if (match) {
                    recipientName = match[1].trim();
                }
            }

            if (recipientName) {
                console.log(`AutoClassifier: Checking history for '${recipientName}'...`);
                // Note: Ensure getLastTransactionForRecipient exists in repo (it should if my other edit worked, otherwise I need to check repo too)
                const history = await this.repo.getLastTransactionForRecipient(recipientName);
                if (history && history.categoryName) {
                    console.log(`AutoClassifier: Found context for '${recipientName}' -> ${history.categoryName}`);
                    contextHint = history.categoryName;
                    isTrusted = true;
                } else {
                    console.log(`AutoClassifier: No history found for '${recipientName}'.`);
                }
            }

            // 4. Classify
            const startStr = `Spent ${expense.amount} on ${expense.description}`;
            // @ts-ignore - Ignoring TS error if LlmClient signature isn't updated yet (I will update it next)
            const result = await LlmClient.getInstance().categorize(startStr, [], contextHint);

            if (result.category) {
                const catObj = this.repo.getCategoryByName(result.category);
                if (catObj && catObj.name !== 'Other') {
                    console.log(`AutoClassifier: Upgraded ${expense.id} -> ${catObj.name} (Verified: ${isTrusted})`);
                    await this.repo.updateExpense(expense.id, {
                        categoryId: catObj.id,
                        isVerified: isTrusted // Mark as verified if we had historical context
                    });
                    this.consecutiveFailures = 0;
                } else {
                    // Category from LLM (e.g. 'Salary') doesn't match any DB category.
                    console.warn(`AutoClassifier: Unknown category '${result.category}' for ${expense.id}. Skipping.`);
                    this.failedIds.add(expense.id);
                }
            } else {
                // Empty result or confidence low
                this.failedIds.add(expense.id);
            }
        } catch (e) {
            console.error("AutoClassifier Error", e);
            this.failedIds.add(expense.id); // Skip this one for now
            this.consecutiveFailures++;
        }

        if (this.consecutiveFailures >= this.MAX_FAILURES) {
            console.warn("AutoClassifier: Too many consecutive failures. Stopping.");
            this.notify('Error: AI Model Failed', false);
            this.isRunning = false;
            return;
        }

        // 4. Loop (Slower Pace)
        setTimeout(() => this.processNext(), 4000);
    }
}
