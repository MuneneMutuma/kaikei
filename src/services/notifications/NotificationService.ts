import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { MpesaTransaction } from '../../utils/mpesaParser';
import { ExpenseRepository } from '../ledger/ExpenseRepository';

class NotificationServiceImpl {
    private static instance: NotificationServiceImpl | null = null;
    private channelId: string = 'mpesa_auto_popup';

    private constructor() {}

    static getInstance(): NotificationServiceImpl {
        if (!NotificationServiceImpl.instance) {
            NotificationServiceImpl.instance = new NotificationServiceImpl();
        }
        return NotificationServiceImpl.instance;
    }

    async init() {
        // Create a channel required for Android 8.0+
        await notifee.createChannel({
            id: this.channelId,
            name: 'M-Pesa Transaction Popups',
            importance: AndroidImportance.HIGH, // Required for heads-up notifications
            vibration: true,
        });

        console.log('[NotificationService] Channel created');
    }

    async showTransactionPopup(transaction: MpesaTransaction, categoryName: string = 'Other') {
        const title = `Ksh ${transaction.amount} paid to ${transaction.to || 'Unknown'}`;
        const body = `Categorized as: ${categoryName}`;

        await notifee.displayNotification({
            title,
            body,
            data: { tx_id: transaction.tx_id, amount: transaction.amount.toString() },
            android: {
                channelId: this.channelId,
                importance: AndroidImportance.HIGH,
                color: '#13ec5b', // Kaikei Primary Green
                pressAction: {
                    id: 'default',
                    launchActivity: 'default',
                },
                actions: [
                    {
                        title: 'Confirm',
                        pressAction: { id: 'action_confirm' },
                    },
                    {
                        title: 'Change',
                        pressAction: { 
                            id: 'action_change',
                            launchActivity: 'default', // Brings app to foreground to deep link
                        },
                    },
                ],
            },
        });
    }

    // This handles background actions
    async handleBackgroundEvent(event: any) {
        const { type, detail } = event;
        if (type !== EventType.ACTION_PRESS) return;

        const { pressAction, notification } = detail;
        const txId = notification?.data?.tx_id;
        if (!txId) return;

        try {
            // Lazy load to prevent circular dependencies at boot
            const { ExpenseRepository } = require('../ledger/ExpenseRepository');
            const { Database } = require('../ledger/Database');
            
            const repo = new ExpenseRepository();
            const db = Database.getInstance();

            const result = await db.execute('SELECT id FROM expenses WHERE transactionId = ? LIMIT 1', [txId]);
            const rows = Database.getRows(result);
            if (rows.length === 0) return;
            
            const internalId = rows[0].id;

            if (pressAction.id === 'action_confirm') {
                // Confirm the auto-categorized category by marking it as verified
                await repo.updateExpense(internalId, { isVerified: true });
                await notifee.cancelNotification(notification.id);
            } else if (pressAction.id === 'action_change' || pressAction.id === 'cat_other') {
                // Save to AsyncStorage so App.tsx can read it when it comes to foreground
                const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                await AsyncStorage.setItem('pendingCategoryTxId', txId);
            }
        } catch (e) {
            console.error('[NotificationService] Error handling action:', e);
        }
    }
}

export const NotificationService = NotificationServiceImpl.getInstance();
