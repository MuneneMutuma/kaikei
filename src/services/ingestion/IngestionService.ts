/**
 * IngestionService — Core auto-ingestion engine.
 * 
 * Manages all three tiers of M-Pesa SMS detection:
 * - Tier 1: Runtime BroadcastReceiver (via SmsListenerModule native events)
 * - Tier 2: Headless JS task (invoked by MpesaHeadlessService from NotificationListener → WorkManager)
 * - Tier 3: Catch-up scan on app launch (reads SMS inbox for missed messages)
 * 
 * Also serves as the Headless JS task entry point registered in AppRegistry.
 */

import { NativeModules, NativeEventEmitter, AppRegistry, AppState, AppStateStatus } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import { parseMpesaMessage, MpesaTransaction } from '../../utils/mpesaParser';
import { ExpenseRepository } from '../ledger/ExpenseRepository';
import { TransactionImporter } from './TransactionImporter';
import { IngestionEvents, INGESTION_EVENT, CatchUpResult } from './IngestionEvents';
import { SettingsRepository } from '../settings/SettingsRepository';
import { NotificationService } from '../notifications/NotificationService';

const { SmsListenerModule } = NativeModules;

class IngestionServiceImpl {
    private static instance: IngestionServiceImpl | null = null;

    private importer: TransactionImporter;
    private repo: ExpenseRepository;
    private settings: SettingsRepository;
    private eventSubscription: any = null;
    private appStateSubscription: any = null;
    private isListening = false;
    private lastCatchUpTimestamp: number = 0;

    private constructor() {
        this.repo = new ExpenseRepository();
        this.importer = new TransactionImporter(this.repo);
        this.settings = new SettingsRepository();
    }

    static getInstance(): IngestionServiceImpl {
        if (!IngestionServiceImpl.instance) {
            IngestionServiceImpl.instance = new IngestionServiceImpl();
        }
        return IngestionServiceImpl.instance;
    }

    /**
     * Start the ingestion service.
     * - Subscribes to Tier 1 native SMS events
     * - Runs a Tier 3 catch-up scan
     * - Listens for app state changes to re-scan on focus
     */
    async start(): Promise<void> {
        if (this.isListening) {
            console.log('[IngestionService] Already running');
            return;
        }

        const autoImportEnabled = await this.settings.isAutoImportEnabled();
        if (!autoImportEnabled) {
            console.log('[IngestionService] Auto-import disabled, not starting');
            return;
        }

        console.log('[IngestionService] Starting...');
        this.isListening = true;

        // Tier 1: Subscribe to native SMS events
        this.startRuntimeListener();

        // Tier 3: Catch-up scan for missed messages
        await this.runCatchUpScan();

        // Re-scan when app comes to foreground
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

        await NotificationService.init();

        console.log('[IngestionService] Started successfully');
    }

    /**
     * Stop the ingestion service.
     */
    stop(): void {
        console.log('[IngestionService] Stopping...');

        // Unsubscribe from native events
        if (this.eventSubscription) {
            this.eventSubscription.remove();
            this.eventSubscription = null;
        }

        // Unsubscribe from app state changes
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }

        // Stop native listener
        try {
            SmsListenerModule?.stopListening();
        } catch (e) {
            // Module might not be available yet
        }

        this.isListening = false;
        console.log('[IngestionService] Stopped');
    }

    /**
     * Tier 1: Start the runtime BroadcastReceiver
     */
    private startRuntimeListener(): void {
        try {
            if (!SmsListenerModule) {
                console.warn('[IngestionService] SmsListenerModule not available (native module missing)');
                return;
            }

            SmsListenerModule.startListening();

            const emitter = new NativeEventEmitter(SmsListenerModule);
            this.eventSubscription = emitter.addListener('onMpesaSmsReceived', (event: { body: string }) => {
                console.log('[IngestionService] Tier 1: Real-time SMS received');
                this.processRawMessage(event.body, 'auto');
            });

            console.log('[IngestionService] Tier 1 runtime listener active');
        } catch (e) {
            console.warn('[IngestionService] Failed to start Tier 1 listener:', e);
        }
    }

    /**
     * Handle app state changes — re-run catch-up when app comes to foreground.
     */
    private handleAppStateChange = (nextState: AppStateStatus) => {
        if (nextState === 'active') {
            // Debounce: only scan if >60s since last scan
            const now = Date.now();
            if (now - this.lastCatchUpTimestamp > 60000) {
                this.runCatchUpScan();
            }
        }
    };

    /**
     * Process a raw SMS body → parse → import.
     * Used by both Tier 1 (runtime) and Tier 2 (headless task).
     */
    async processRawMessage(body: string, source: 'auto' | 'catchup' = 'auto'): Promise<void> {
        // Strict Guard: Check setting again to prevent unwanted imports
        if (!await this.settings.isAutoImportEnabled()) {
            console.log(`[IngestionService] Skipping import (Auto-Import disabled): ${source}`);
            return;
        }

        try {
            const parsed = parseMpesaMessage(body);
            if (!parsed || !parsed.tx_id) {
                console.log('[IngestionService] Could not parse message, skipping');
                return;
            }

            const result = await this.importer.importTransaction(parsed, source);
            if (result.success && !result.skipped) {
                console.log(`[IngestionService] Ingested ${parsed.tx_id} (${source})`);
                
                // Show popup for real-time expenses
                if (source === 'auto' && parsed.amount > 0 && result.expense) {
                    let categoryName = 'Other';
                    try {
                        const cats = await this.repo.getAllCategories();
                        const cat = cats.find(c => c.id === result.expense!.categoryId);
                        if (cat) categoryName = cat.name;
                    } catch (e) {}
                    
                    await NotificationService.showTransactionPopup(parsed, categoryName);
                }
            } else if (result.skipped) {
                console.log(`[IngestionService] Skipped ${parsed.tx_id}: ${result.reason}`);
            }
        } catch (e) {
            console.error('[IngestionService] Failed to process message:', e);
            IngestionEvents.emit(INGESTION_EVENT.INGESTION_ERROR, { error: String(e) });
        }
    }

    /**
     * Tier 3: Catch-up scan — read SMS inbox for un-imported M-Pesa messages.
     * Runs on app launch and when app returns to foreground.
     */
    async runCatchUpScan(): Promise<CatchUpResult> {
        if (!await this.settings.isAutoImportEnabled()) {
            console.log('[IngestionService] Catch-up scan skipped (Auto-Import disabled)');
            return { imported: 0, skipped: 0, errors: 0 };
        }

        console.log('[IngestionService] Tier 3: Starting catch-up scan...');
        this.lastCatchUpTimestamp = Date.now();

        return new Promise<CatchUpResult>((resolve) => {
            const filter = JSON.stringify({
                box: 'inbox',
                address: 'MPESA',
                maxCount: 200,  // Read last 200 M-Pesa messages
            });

            SmsAndroid.list(
                filter,
                (fail: string) => {
                    console.error('[IngestionService] Failed to read SMS:', fail);
                    IngestionEvents.emit(INGESTION_EVENT.INGESTION_ERROR, { error: fail });
                    resolve({ imported: 0, skipped: 0, errors: 1 });
                },
                async (_count: number, smsList: string) => {
                    try {
                        const messages: Array<{ body: string; date: number }> = JSON.parse(smsList);

                        // Parse all messages
                        const transactions: MpesaTransaction[] = [];
                        for (const msg of messages) {
                            try {
                                const parsed = parseMpesaMessage(msg.body);
                                if (parsed && parsed.tx_id) {
                                    transactions.push(parsed);
                                }
                            } catch (e) {
                                // Skip unparseable messages
                            }
                        }

                        if (transactions.length === 0) {
                            console.log('[IngestionService] Catch-up scan: no new transactions found');
                            resolve({ imported: 0, skipped: 0, errors: 0 });
                            return;
                        }

                        // Import batch (TransactionImporter handles dedup)
                        const result = await this.importer.importBatch(transactions, 'catchup');
                        console.log(`[IngestionService] Catch-up scan complete: ${result.imported} imported, ${result.skipped} skipped`);
                        resolve({ imported: result.imported, skipped: result.skipped, errors: result.errors });
                    } catch (e) {
                        console.error('[IngestionService] Catch-up scan error:', e);
                        resolve({ imported: 0, skipped: 0, errors: 1 });
                    }
                }
            );
        });
    }
}

// --- Singleton export ---
export const IngestionService = IngestionServiceImpl.getInstance();

// --- Headless JS Task (Tier 2) ---
// This function is called by MpesaHeadlessService.kt via WorkManager
// when a notification is detected while the app is killed.
const MpesaIngestTask = async (taskData: { smsBody: string }) => {
    console.log('[IngestionService] Tier 2: Headless JS task received');

    if (!taskData?.smsBody) {
        console.warn('[IngestionService] Headless task: no SMS body provided');
        return;
    }

    const service = IngestionServiceImpl.getInstance();
    await service.processRawMessage(taskData.smsBody, 'auto');
};

// Register the headless task globally
// This must be called at module scope (not inside a component)
AppRegistry.registerHeadlessTask('MpesaIngestTask', () => MpesaIngestTask);
