/**
 * TransactionImporter — Shared import logic for M-Pesa transactions.
 * 
 * Used by both:
 * - SmsReaderScreen (manual import)
 * - IngestionService (automatic import — all 3 tiers)
 * 
 * Handles: deduplication, recipient-based categorization (user-correction-driven),
 * type detection, and async mutex to prevent race conditions between Tier 1 & 2.
 */

import { MpesaTransaction } from '../../utils/mpesaParser';
import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { NaturalLanguageParser } from '../parser/NaturalLanguageParser';
import { Category, Expense } from '../ledger/Schema';
import { IngestionEvents, INGESTION_EVENT, IngestedTransaction } from './IngestionEvents';

// --- Async Mutex (prevents Tier 1 vs Tier 2 race condition) ---

class AsyncMutex {
    private queue: (() => void)[] = [];
    private locked = false;

    async acquire(): Promise<() => void> {
        return new Promise<() => void>((resolve) => {
            const tryAcquire = () => {
                if (!this.locked) {
                    this.locked = true;
                    resolve(() => {
                        this.locked = false;
                        const next = this.queue.shift();
                        if (next) next();
                    });
                } else {
                    this.queue.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }
}

// --- Types ---

export interface ImportResult {
    success: boolean;
    transactionId: string;
    skipped: boolean;
    reason?: string;
    expense?: Expense;
}

export interface BatchResult {
    imported: number;
    skipped: number;
    errors: number;
    results: ImportResult[];
}

// --- Date Parser (extracted from SmsReaderScreen) ---

export const parseMpesaDate = (dateStr: string, timeStr?: string): string => {
    try {
        const [day, month, yearPart] = dateStr.split('/').map(Number);
        const year = yearPart < 100 ? 2000 + yearPart : yearPart;

        let hours = 12;
        let minutes = 0;

        if (timeStr) {
            const match = timeStr.match(/(\d+):(\d+)\s?(AM|PM)?/i);
            if (match) {
                let h = parseInt(match[1], 10);
                const m = parseInt(match[2], 10);
                const meridiem = match[3]?.toUpperCase();

                if (meridiem === 'PM' && h < 12) h += 12;
                if (meridiem === 'AM' && h === 12) h = 0;

                hours = h;
                minutes = m;
            }
        }

        const date = new Date(year, month - 1, day, hours, minutes, 0);
        if (isNaN(date.getTime())) throw new Error('Invalid date');
        return date.toISOString();
    } catch (e) {
        return new Date().toISOString();
    }
};

// --- TransactionImporter ---

export class TransactionImporter {
    private repo: ExpenseRepository;
    private parser: NaturalLanguageParser;
    private mutex: AsyncMutex;
    private otherCategoryId: string | null = null;

    constructor(repo?: ExpenseRepository, parser?: NaturalLanguageParser) {
        this.repo = repo || new ExpenseRepository();
        this.parser = parser || new NaturalLanguageParser();
        this.mutex = new AsyncMutex();
    }

    /**
     * Ensure we have the 'Other' category ID cached.
     */
    private async ensureOtherCategory(): Promise<string> {
        if (this.otherCategoryId) return this.otherCategoryId;

        let other = await this.repo.getCategoryByName('Other');
        if (!other) {
            const allCats = await this.repo.getAllCategories();
            if (allCats.length > 0) {
                other = allCats[0];
                console.log(`[TransactionImporter] 'Other' not found, falling back to '${other.name}'`);
            } else {
                other = await this.repo.addCategory('Other', false);
                console.warn('[TransactionImporter] No categories found, created "Other"');
            }
        }

        this.otherCategoryId = other.id;
        return this.otherCategoryId;
    }

    /**
     * Auto-categorize a transaction using the user-correction-driven strategy:
     * 
     * 1. Check recipient history (user's past categorizations → highest priority)
     * 2. Keyword-based prediction (regex)
     * 3. Fallback to 'Other' (AutoClassifier will LLM-classify later)
     */
    async categorizeByRecipientHistory(recipient: string, description: string): Promise<string> {
        const otherCatId = await this.ensureOtherCategory();

        // 1. User correction history (highest priority)
        if (recipient && recipient !== 'Unknown') {
            try {
                const lastTx = await this.repo.getLastTransactionForRecipient(recipient);
                if (lastTx?.categoryName && lastTx.categoryName !== 'Other' && lastTx.categoryId) {
                    console.log(`[TransactionImporter] Categorized "${recipient}" → "${lastTx.categoryName}" (from history)`);
                    return lastTx.categoryId;
                }
            } catch (e) {
                console.warn('[TransactionImporter] Recipient history lookup failed:', e);
            }
        }

        // 2. Keyword-based prediction
        try {
            const predicted = await this.parser.predictCategory(description);
            if (predicted?.id && predicted.name !== 'Other') {
                console.log(`[TransactionImporter] Categorized "${recipient}" → "${predicted.name}" (from keywords)`);
                return predicted.id;
            }
        } catch (e) {
            console.warn('[TransactionImporter] Keyword prediction failed:', e);
        }

        // 3. Fallback
        return otherCatId;
    }

    /**
     * Determine transaction type from parsed M-Pesa data.
     */
    private determineType(tx: MpesaTransaction): 'income' | 'expense' | 'transfer' {
        const isInternal = tx.type === 'internal' || tx.direction === 'internal';
        if (isInternal) return 'transfer';
        if (tx.direction === 'in') return 'income';
        if (tx.type === 'transfer') return 'transfer';
        return 'expense';
    }

    /**
     * Build a clean description from the parsed transaction.
     */
    private buildDescription(tx: MpesaTransaction): string {
        return tx.direction === 'in'
            ? `Received from ${tx.from}`
            : `Paid to ${tx.to || tx.account || 'Unknown'}`;
    }

    /**
     * Determine sender and recipient.
     */
    private determineSenderRecipient(tx: MpesaTransaction, type: string): { sender: string; recipient: string } {
        if (type === 'income') {
            return { sender: tx.from, recipient: 'M-PESA' };
        }
        return { sender: 'M-PESA', recipient: tx.to || tx.account || 'Unknown' };
    }

    /**
     * Import a single M-Pesa transaction.
     * 
     * Uses async mutex to prevent Tier 1 vs Tier 2 race condition.
     * Uses INSERT OR IGNORE for SQLite-level dedup.
     */
    async importTransaction(
        tx: MpesaTransaction,
        source: 'auto' | 'catchup' | 'manual' = 'manual'
    ): Promise<ImportResult> {
        const release = await this.mutex.acquire();

        try {
            // 1. Check if already imported (JS-level check before hitting DB)
            if (await this.repo.existsByTransactionId(tx.tx_id)) {
                return { success: true, transactionId: tx.tx_id, skipped: true, reason: 'Already imported' };
            }

            // 2. Check if ignored
            const ignoredIds = await this.repo.getIgnoredTransactionIds();
            if (ignoredIds.has(tx.tx_id)) {
                return { success: true, transactionId: tx.tx_id, skipped: true, reason: 'User ignored' };
            }

            // 3. Determine type
            const type = this.determineType(tx);
            const isInternal = type === 'transfer';

            // 4. Build metadata
            const description = this.buildDescription(tx);
            const { sender, recipient } = this.determineSenderRecipient(tx, type);
            const descriptionToParse = `${tx.from} ${tx.to} ${tx.type}`;

            // 5. Auto-categorize using recipient history
            const categoryId = await this.categorizeByRecipientHistory(recipient, descriptionToParse);

            // 6. Insert (INSERT OR IGNORE handles SQLite-level dedup)
            const expense = await this.repo.addExpense({
                amount: tx.amount,
                date: parseMpesaDate(tx.date, tx.time),
                description,
                categoryId,
                source: 'mpesa',
                rawText: tx.raw_text,
                transactionId: tx.tx_id,
                excludeFromAnalytics: isInternal,
                type,
                sender,
                recipient,
            });

            // 7. Emit event for UI refresh (only if actually inserted)
            if (source !== 'manual') {
                // Resolve category name for event
                let categoryName = 'Other';
                try {
                    const cats = await this.repo.getAllCategories();
                    const cat = cats.find((c: Category) => c.id === categoryId);
                    if (cat) categoryName = cat.name;
                } catch (e) { /* non-critical */ }

                const eventData: IngestedTransaction = {
                    transactionId: tx.tx_id,
                    amount: tx.amount,
                    recipient,
                    categoryName,
                    type,
                    source,
                };
                IngestionEvents.emit(INGESTION_EVENT.TRANSACTION_INGESTED, eventData);
            }

            console.log(`[TransactionImporter] Imported ${tx.tx_id} → ${type} (${source})`);
            return { success: true, transactionId: tx.tx_id, skipped: false, expense };

        } catch (e) {
            console.error(`[TransactionImporter] Failed to import ${tx.tx_id}:`, e);
            return { success: false, transactionId: tx.tx_id, skipped: false, reason: String(e) };
        } finally {
            release();
        }
    }

    /**
     * Import a batch of transactions.
     * Used by SmsReaderScreen "Import All" and IngestionService catch-up scan.
     */
    async importBatch(
        transactions: MpesaTransaction[],
        source: 'auto' | 'catchup' | 'manual' = 'manual'
    ): Promise<BatchResult> {
        let imported = 0;
        let skipped = 0;
        let errors = 0;
        const results: ImportResult[] = [];

        for (const tx of transactions) {
            const result = await this.importTransaction(tx, source);
            results.push(result);

            if (result.skipped) {
                skipped++;
            } else if (result.success) {
                imported++;
            } else {
                errors++;
            }
        }

        // Emit batch completion event
        if (source !== 'manual') {
            IngestionEvents.emit(INGESTION_EVENT.CATCH_UP_COMPLETE, { imported, skipped, errors });
        }

        console.log(`[TransactionImporter] Batch complete: ${imported} imported, ${skipped} skipped, ${errors} errors`);
        return { imported, skipped, errors, results };
    }
}
