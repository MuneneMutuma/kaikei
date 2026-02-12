import { Alert, Share, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { ExpenseRepository } from '../ledger/ExpenseRepository';

export class BackupService {
    private repo = new ExpenseRepository();

    public async createBackup(): Promise<{ success: boolean; path?: string; error?: any }> {
        try {
            // 1. Get Data
            const jsonString = await this.repo.exportDataAsJSON();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `kaikei_backup_${timestamp}.json`;

            let path = '';

            if (Platform.OS === 'android') {
                const dir = `${RNFS.DownloadDirectoryPath}/KaikeiBackups`;
                await RNFS.mkdir(dir);
                path = `${dir}/${fileName}`;
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

    public async restoreBackup(): Promise<void> {
        // Placeholder for restore logic
        Alert.alert("Coming Soon", "Restore functionality will be implemented in the next update.");
    }
}
