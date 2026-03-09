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
     * List available backup files from multiple potential directories
     */
    public async listBackups(): Promise<BackupFile[]> {
        console.log(`[BackupService] Starting backup scan...`);
        const potentialDirs = [
            BACKUP_DIR,
            RNFS.DownloadDirectoryPath,
            '/storage/emulated/0/Download', // Fallback for some Android versions
        ];

        console.log(`[BackupService] Potential directories:`, potentialDirs);

        const allFiles: BackupFile[] = [];
        const seenPaths = new Set<string>();

        for (const dir of potentialDirs) {
            console.log(`Pontential Dir: ${dir}`);
            try {
                const exists = await RNFS.exists(dir);
                console.log(`[BackupService] Checking ${dir} - Exists: ${exists}`);
                if (!exists) continue;

                const branch = await RNFS.readDir(dir);
                console.log(`[BackupService] Found ${branch.length} items in ${dir}`);
                for (const f of branch) {
                    console.log(`${f.name}`)
                    if (f.isFile() && f.name.endsWith('.json') && f.name.includes('kaikei_backup')) {
                        console.log(`[BackupService] Match found: ${f.name}`);
                        allFiles.push({
                            name: f.name,
                            path: f.path,
                            size: Number(f.size),
                            mtime: new Date(f.mtime || 0),
                        });
                        seenPaths.add(f.path);
                    }
                }
            } catch (e) {
                console.warn(`[BackupService] Failed to scan directory ${dir}:`, e);
            }
        }

        console.log(`[BackupService] Scan complete. Total backups found: ${allFiles.length}`);
        return allFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first
    }

    /**
     * Restore from a specific backup file path
     */
    public async restoreFromFile(filePath: string): Promise<{
        success: boolean;
        counts?: Record<string, number>;
        error?: string;
    }> {
        console.log(`[BackupService] Starting restore from: ${filePath}`);
        let tempPath = filePath;
        const isContentUri = filePath.startsWith('content://');

        try {
            if (isContentUri) {
                console.log(`[BackupService] Handling content URI. Copying to cache...`);
                tempPath = `${RNFS.CachesDirectoryPath}/temp_restore.json`;
                if (await RNFS.exists(tempPath)) {
                    await RNFS.unlink(tempPath);
                }
                await RNFS.copyFile(filePath, tempPath);
                console.log(`[BackupService] Copy successful.`);
            }

            const fileContent = await RNFS.readFile(tempPath, 'utf8');

            // Import data using the repository
            const counts = await this.repo.importDataFromJSON(fileContent);

            // Cleanup temp file if we created one
            if (isContentUri) {
                await RNFS.unlink(tempPath);
            }

            console.log(`[BackupService] Restore complete. Table counts:`, counts);
            return { success: true, counts };

        } catch (error: any) {
            console.error("[BackupService] Restore Failed", error);
            return { success: false, error: error?.message || 'Unknown error during restore.' };
        }
    }
}
