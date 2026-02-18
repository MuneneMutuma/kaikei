import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { LlmClient } from '../llm/LlmClient';
import { ModelManager } from '../llm/ModelManager';
import { IngestionEvents, INGESTION_EVENT } from '../ingestion/IngestionEvents';
import { parseMpesaMessage } from '../../utils/mpesaParser';

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

    public async start() {
        // Load Settings
        const historyEnabledStr = await this.repo.getSetting('ai_history_enabled');
        const llmEnabledStr = await this.repo.getSetting('ai_llm_enabled');

        // Defaults: History=TRUE, LLM=FALSE (as requested)
        const isHistoryEnabled = historyEnabledStr !== 'false';
        const isLlmEnabled = llmEnabledStr === 'true'; // Default false

        if (!isHistoryEnabled && !isLlmEnabled) {
            console.log("AutoClassifier: All strategies disabled.");
            this.notify('Disabled', false);
            return;
        }

        if (this.isRunning) return;

        console.log(`AutoClassifier: Started (History: ${isHistoryEnabled}, LLM: ${isLlmEnabled})`);
        this.isRunning = true;
        this.processNext(isHistoryEnabled, isLlmEnabled);
    }

    public stop() {
        this.isRunning = false;
        this.notify('Paused', false);
    }

    public async setStrategyEnabled(strategy: 'history' | 'llm', enabled: boolean) {
        await this.repo.setSetting(`ai_${strategy}_enabled`, String(enabled));

        // Restart to pick up new config
        if (this.isRunning) {
            this.restart();
        } else if (enabled) {
            this.start();
        }
    }

    public restart() {
        console.log("AutoClassifier: Restarting...");
        this.stop();
        this.consecutiveFailures = 0;
        this.failedIds.clear();
        setTimeout(() => this.start(), 100); // Small delay to ensure clean restart
    }

    private consecutiveFailures = 0;
    private readonly MAX_FAILURES = 20;
    private failedIds = new Set<string>(); // Skip items we can't handle this session

    private async processNext(historyEnabled: boolean = true, llmEnabled: boolean = false) {
        if (!this.isRunning) return;

        // 1. Check Model (Only if LLM is enabled?) 
        // Actually, if only history is enabled, we don't need the model.
        if (llmEnabled) {
            const isReady = await ModelManager.isModelReady();
            if (!isReady) {
                this.consecutiveFailures++;
                if (this.consecutiveFailures >= 3) {
                    this.notify('Model not ready. Paused.', false);
                    this.isRunning = false;
                    return;
                }
                this.notify('Waiting for AI Model...', false);
                setTimeout(() => this.processNext(historyEnabled, llmEnabled), 10000);
                return;
            }
        }

        // 2. Fetch candidates
        const candidates = await this.repo.getUncategorizedExpenses(10);
        const expense = candidates.find(c => !this.failedIds.has(c.id));

        if (!expense) {
            this.notify('All Caught Up!', false);
            this.isRunning = false;
            this.consecutiveFailures = 0;
            return;
        }

        console.log(`AutoClassifier: Processing ${expense.id} (${expense.recipient})...`);
        this.notify(`Classifying: ${expense.recipient || 'Unknown'}`, true);

        try {
            // =========================================================
            // STRATEGY 1: HISTORY & RULES (Verified + Internal)
            // =========================================================
            if (historyEnabled) {
                // A. Check for Internal Transfers using shared logic
                let isInternal = false;
                if (expense.rawText) {
                    const parsed = parseMpesaMessage(expense.rawText);
                    if (parsed && (parsed.type === 'internal' || parsed.direction === 'internal')) {
                        isInternal = true;
                    }
                }

                if (isInternal) {
                    console.log(`AutoClassifier: flagging '${expense.recipient}' as Internal Transfer`);
                    await this.repo.updateExpense(expense.id, {
                        isVerified: true,
                        excludeFromAnalytics: true
                    });

                    IngestionEvents.emit(INGESTION_EVENT.TRANSACTION_INGESTED, {
                        transactionId: expense.id,
                        recipient: expense.recipient,
                        categoryName: 'Internal Transfer',
                        amount: expense.amount,
                        type: 'transfer',
                        source: 'auto'
                    } as any);

                    this.consecutiveFailures = 0;
                    setTimeout(() => this.processNext(historyEnabled, llmEnabled), 100);
                    return;
                }

                // B. Check Verified History
                const history = await this.repo.getLastTransactionForRecipient(expense.recipient || '');
                if (history && history.categoryId) {
                    console.log(`AutoClassifier: History Match for '${expense.recipient}' -> ${history.categoryName}`);
                    await this.repo.updateExpense(expense.id, {
                        categoryId: history.categoryId,
                        isVerified: false, // AI proposals are unverified until human confirms
                        excludeFromAnalytics: history.excludeFromAnalytics
                    });

                    IngestionEvents.emit(INGESTION_EVENT.TRANSACTION_INGESTED, {
                        transactionId: expense.id,
                        recipient: expense.recipient,
                        categoryName: history.categoryName,
                        amount: expense.amount,
                        type: 'expense',
                        source: 'auto'
                    } as any);

                    this.consecutiveFailures = 0;
                    setTimeout(() => this.processNext(historyEnabled, llmEnabled), 500);
                    return;
                }
            }

            // =========================================================
            // STRATEGY 2: LLM (Generative AI)
            // =========================================================
            if (llmEnabled) {
                const categories = await this.repo.getAllCategories();
                const categoryNames = categories.map(c => c.name);
                const promptInstructions = `
                     Categorize this transaction into one of: ${categoryNames.join(', ')}.
                     Recipient: ${expense.recipient}
                     Description: ${expense.description}
                     Amount: ${expense.amount}
                     Date: ${new Date(expense.date).toLocaleDateString()}
                     
                     Return ONLY the category name. If unsure, return "Uncategorized".
                 `;

                const result = await LlmClient.getInstance().categorize(promptInstructions, categoryNames);

                // result is { amount?, category?, description? }
                const predictedCategory = result?.category;

                if (predictedCategory && predictedCategory !== 'Uncategorized' && predictedCategory !== 'Other') {
                    const cat = categories.find(c => c.name.toLowerCase() === predictedCategory.toLowerCase());
                    if (cat) {
                        console.log(`AutoClassifier: LLM Match for '${expense.recipient}' -> ${cat.name}`);
                        await this.repo.updateExpense(expense.id, {
                            categoryId: cat.id,
                            isVerified: false
                        });

                        IngestionEvents.emit(INGESTION_EVENT.TRANSACTION_INGESTED, {
                            transactionId: expense.id,
                            recipient: expense.recipient,
                            categoryName: cat.name,
                            amount: expense.amount,
                            type: 'expense',
                            source: 'auto'
                        } as any);

                        this.consecutiveFailures = 0;
                        setTimeout(() => this.processNext(historyEnabled, llmEnabled), 500);
                        return;
                    }
                }
                console.log(`AutoClassifier: LLM returned '${predictedCategory}', could not match category.`);
            }

            // If we got here, we failed to categorize (either no history match, or LLM failed/disabled)
            console.log(`AutoClassifier: Could not categorize '${expense.recipient}'. Skipping.`);
            this.failedIds.add(expense.id);
            this.consecutiveFailures = 0;
            setTimeout(() => this.processNext(historyEnabled, llmEnabled), 100);

        } catch (error) {
            console.error("AutoClassifier Error", error);
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= this.MAX_FAILURES) {
                this.notify('Error Limit Reached', false);
                this.isRunning = false;
            } else {
                setTimeout(() => this.processNext(historyEnabled, llmEnabled), 2000);
            }
        }
    }
}
