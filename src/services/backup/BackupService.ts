import { Share, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { ExpenseRepository } from '../ledger/ExpenseRepository';

const BACKUP_DIR = `${RNFS.DownloadDirectoryPath}/KaikeiBackups`;

export interface BackupFile {
    name: string;
    path: string;
    size: number;
    mtime: Date;
}

export class BackupService {
    private repo = new ExpenseRepository();

    public async createBackup(): Promise<{ success: boolean; path?: string; error?: any }> {
        try {
            const jsonString = await this.repo.exportDataAsJSON();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `kaikei_backup_${timestamp}.json`;

            let path = '';

            if (Platform.OS === 'android') {
                await RNFS.mkdir(BACKUP_DIR);
                path = `${BACKUP_DIR}/${fileName}`;
                await RNFS.writeFile(path, jsonString, 'utf8');
            } else {
                path = `${RNFS.DocumentDirectoryPath}/${fileName}`;
                await RNFS.writeFile(path, jsonString, 'utf8');

                await Share.share({
                    title: 'Kaikei Backup',
                    message: 'Here is your Kaikei data backup.',
                    url: path,
                });
            }

            console.log(`Backup written to ${path}`);
            return { success: true, path };

        } catch (error) {
            console.error("Backup Failed", error);
            return { success: false, error };
        }
    }

    /**
     * List available backup files from the KaikeiBackups directory
     */
    public async listBackups(): Promise<BackupFile[]> {
        try {
            const exists = await RNFS.exists(BACKUP_DIR);
            if (!exists) return [];

            const files = await RNFS.readDir(BACKUP_DIR);
            return files
                .filter(f => f.isFile() && f.name.endsWith('.json'))
                .map(f => ({
                    name: f.name,
                    path: f.path,
                    size: Number(f.size),
                    mtime: new Date(f.mtime || 0),
                }))
                .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first
        } catch (e) {
            console.error('Failed to list backups:', e);
            return [];
        }
    }

    /**
     * Restore from a specific backup file path
     */
    public async restoreFromFile(filePath: string): Promise<{
        success: boolean;
        counts?: { expenses: number; categories: number; settings: number; ignored: number };
        error?: string;
    }> {
        try {
            const fileContent = await RNFS.readFile(filePath, 'utf8');

            // Basic validation
            const parsed = JSON.parse(fileContent);
            if (!parsed.expenses || !parsed.categories) {
                return { success: false, error: 'Invalid backup file: missing expenses or categories data.' };
            }

            const counts = await this.repo.importDataFromJSON(fileContent);
            console.log(`Restore complete: ${counts.expenses} expenses, ${counts.categories} categories, ${counts.settings} settings, ${counts.ignored} ignored`);
            return { success: true, counts };

        } catch (error: any) {
            console.error("Restore Failed", error);
            return { success: false, error: error?.message || 'Unknown error during restore.' };
        }
    }
}
