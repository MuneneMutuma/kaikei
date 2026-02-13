/**
 * IngestionEvents — Event emitter for the auto-ingestion pipeline.
 * 
 * Allows UI components to subscribe to real-time updates when
 * transactions are automatically ingested (any tier).
 */

type Listener<T = void> = (data: T) => void;

export interface IngestedTransaction {
    transactionId: string;
    amount: number;
    recipient: string;
    categoryName: string;
    type: 'income' | 'expense' | 'transfer';
    source: 'auto' | 'catchup';
}

export interface CatchUpResult {
    imported: number;
    skipped: number;
    errors: number;
}

class IngestionEventEmitter {
    private listeners: Map<string, Set<Listener<any>>> = new Map();

    on<T>(event: string, listener: Listener<T>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);

        // Return unsubscribe function
        return () => {
            this.listeners.get(event)?.delete(listener);
        };
    }

    emit<T>(event: string, data: T): void {
        this.listeners.get(event)?.forEach(listener => {
            try {
                listener(data);
            } catch (e) {
                console.error(`[IngestionEvents] Listener error for '${event}':`, e);
            }
        });
    }

    removeAllListeners(event?: string): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }
}

// Singleton
export const IngestionEvents = new IngestionEventEmitter();

// Event name constants
export const INGESTION_EVENT = {
    TRANSACTION_INGESTED: 'transactionIngested',
    CATCH_UP_COMPLETE: 'catchUpComplete',
    INGESTION_ERROR: 'ingestionError',
} as const;
