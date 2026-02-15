import { Database } from '../ledger/Database';

export interface UserSettings {
    userName: string;
    userPersona: string;
    onboardingComplete: boolean;
    currency: string;
}

export class SettingsRepository {
    private db = Database.getInstance();

    constructor() { }

    /**
     * Initializes the settings table if not already created (handled in Database.ts, but good to double check or have migration here)
     */
    public async init() {
        // Table creation is currently centralized in Database.ts
    }

    public async setValue(key: string, value: string): Promise<void> {
        // Upsert logic (Insert or Replace)
        await this.db.execute(
            `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
            [key, value]
        );
    }

    public async getValue(key: string): Promise<string | null> {
        const result = await this.db.execute(
            `SELECT value FROM settings WHERE key = ?`,
            [key]
        );
        const rows = Database.getRows(result);
        if (rows.length > 0) {
            return rows[0].value;
        }
        return null;
    }

    public async getAllSettings(): Promise<Record<string, string>> {
        const result = await this.db.execute(`SELECT * FROM settings`);
        const settings: Record<string, string> = {};
        const rows = Database.getRows(result);
        for (let i = 0; i < rows.length; i++) {
            const item = rows[i];
            settings[item.key] = item.value;
        }
        return settings;
    }

    // Typed Helpers
    public async getUserSettings(): Promise<UserSettings> {
        const all = await this.getAllSettings();
        return {
            userName: all['user_name'] || '',
            userPersona: all['user_persona'] || 'Standard',
            onboardingComplete: all['onboarding_complete'] === 'true',
            currency: all['currency'] || 'KES'
        };
    }

    public async saveUserProfile(name: string, persona: string): Promise<void> {
        await this.setValue('user_name', name);
        await this.setValue('user_persona', persona);
        await this.setValue('onboarding_complete', 'true');
    }

    public async isOnboardingComplete(): Promise<boolean> {
        const val = await this.getValue('onboarding_complete');
        return val === 'true';
    }

    // --- Auto-Import Settings ---

    public async isAutoImportEnabled(): Promise<boolean> {
        const val = await this.getValue('auto_import_enabled');
        return val === 'true';
    }

    public async setAutoImportEnabled(enabled: boolean): Promise<void> {
        await this.setValue('auto_import_enabled', enabled ? 'true' : 'false');
    }

    public async isAlwaysOnEnabled(): Promise<boolean> {
        const val = await this.getValue('always_on_enabled');
        return val === 'true';
    }

    public async setAlwaysOnEnabled(enabled: boolean): Promise<void> {
        await this.setValue('always_on_enabled', enabled ? 'true' : 'false');
    }

    // --- AI Settings ---

    public async isOfflineCategorizationEnabled(): Promise<boolean> {
        try {
            const val = await this.getValue('offline_categorization_enabled');
            // Default to TRUE if not set, but only if model is ready? 
            // Actually default to TRUE for now.
            return val !== 'false';
        } catch {
            return true;
        }
    }

    public async setOfflineCategorizationEnabled(enabled: boolean): Promise<void> {
        await this.setValue('offline_categorization_enabled', enabled ? 'true' : 'false');
    }

    public async isOfflineAdviceEnabled(): Promise<boolean> {
        try {
            const val = await this.getValue('offline_advice_enabled');
            return val !== 'false';
        } catch {
            return true;
        }
    }

    public async setOfflineAdviceEnabled(enabled: boolean): Promise<void> {
        await this.setValue('offline_advice_enabled', enabled ? 'true' : 'false');
    }

    public async isPreferLocalModelEnabled(): Promise<boolean> {
        try {
            const val = await this.getValue('prefer_local_model_enabled');
            return val === 'true';
        } catch {
            return false;
        }
    }

    public async setPreferLocalModelEnabled(enabled: boolean): Promise<void> {
        await this.setValue('prefer_local_model_enabled', enabled ? 'true' : 'false');
    }
}
