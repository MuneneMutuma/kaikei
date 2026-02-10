import RNFS from 'react-native-fs';

export const MODEL_CONFIG = {
    name: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/df5bf01389a39c743ab467d734bf501681e041c5/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: 398000000, // Approx 380MB
};

// State (Module Level to avoid static init issues)
const listeners: Set<(state: { isDownloading: boolean; progress: number }) => void> = new Set();
let isDownloading = false;
let progress = 0;

export class ModelManager {
    static getModelPath(): string {
        return `${RNFS.DocumentDirectoryPath}/${MODEL_CONFIG.name}`;
    }

    // ... unchanged ...

    // Helper to delete previous heavy models to save space
    static async cleanupOldModels() {
        try {
            // List of old model names to remove
            const oldModels = ['llama-3.2-1b-instruct-q4_k_m.gguf'];
            for (const m of oldModels) {
                const p = `${RNFS.DocumentDirectoryPath}/${m}`;
                if (await RNFS.exists(p)) {
                    console.log(`ModelManager: Removing old model ${m}`);
                    await RNFS.unlink(p);
                }
            }
        } catch (e) {
            console.warn("Cleanup failed", e);
        }
    }

    static getMetaPath(): string {
        return `${RNFS.DocumentDirectoryPath}/model_metadata.json`;
    }

    static addListener(callback: (state: { isDownloading: boolean; progress: number }) => void) {
        listeners.add(callback);
        // Initial state
        callback({ isDownloading, progress });
        return () => listeners.delete(callback);
    }

    private static notify() {
        listeners.forEach(cb => cb({ isDownloading, progress }));
    }

    static getJobIdPath(): string {
        return `${RNFS.DocumentDirectoryPath}/download_job.id`;
    }

    static async killGhostDownloads() {
        try {
            const path = ModelManager.getJobIdPath();
            if (await RNFS.exists(path)) {
                const idStr = await RNFS.readFile(path, 'utf8');
                const id = parseInt(idStr.trim());
                if (!isNaN(id)) {
                    console.log(`ModelManager: Killing ghost download (Job ID: ${id})`);
                    RNFS.stopDownload(id);
                }
                // Don't wait, assuming stop works or fails safely
                await RNFS.unlink(path);
            }
        } catch (e) {
            console.warn("ModelManager: Failed to kill ghost download", e);
        }
    }

    static async isModelReady(): Promise<boolean> {
        const path = ModelManager.getModelPath();
        const exists = await RNFS.exists(path);
        if (!exists) return false;

        const stat = await RNFS.stat(path);
        const currentSize = parseInt(stat.size);

        // 1. Try to check against dynamic metadata
        try {
            const metaPath = ModelManager.getMetaPath();
            if (await RNFS.exists(metaPath)) {
                const metaContent = await RNFS.readFile(metaPath, 'utf8');
                const meta = JSON.parse(metaContent);
                if (meta.expectedSize && meta.expectedSize > 0) {
                    // Exact match required
                    console.log(`ModelManager: verifying size ${currentSize} against expected ${meta.expectedSize}`);
                    return currentSize === meta.expectedSize;
                }
            }
        } catch (e) {
            console.warn("ModelManager: Failed to read metadata", e);
        }

        // 2. Fallback to heuristic if no metadata (e.g. file copied manually)
        // Adjusted for Qwen 0.5B which is ~380MB. Threshold set to 200MB.
        return currentSize > 200 * 1024 * 1024;
    }

    private static startMonitoring(modelPath: string, jobIdPath: string, initialSize: number) {
        // We assume it's alive and start monitoring
        isDownloading = true;
        progress = initialSize / MODEL_CONFIG.size;
        ModelManager.notify();

        const checkCompletion = async (currentSize: number) => {
            if (currentSize >= MODEL_CONFIG.size) {
                console.log("ModelManager: File is already complete. Cleaning up job.");
                progress = 1;
                isDownloading = false;
                ModelManager.notify();
                await RNFS.unlink(jobIdPath).catch(() => { });
                return true;
            }
            return false;
        };

        // Immediate check
        if (initialSize >= MODEL_CONFIG.size) {
            checkCompletion(initialSize);
            return;
        }

        let lastSize = initialSize;
        let retries = 0;

        const pollInterval = setInterval(async () => {
            try {
                if (!(await RNFS.exists(modelPath))) {
                    clearInterval(pollInterval);
                    isDownloading = false;
                    ModelManager.notify();
                    return;
                }

                const s = await RNFS.stat(modelPath);
                const currentSize = parseInt(s.size);

                // Check completion first
                if (await checkCompletion(currentSize)) {
                    clearInterval(pollInterval);
                    return;
                }

                if (currentSize > lastSize) {
                    // Active!
                    lastSize = currentSize;
                    progress = currentSize / MODEL_CONFIG.size;
                    ModelManager.notify();
                    retries = 0; // Reset timeout
                } else {
                    // Stalled?
                    retries++;
                }

                // Timeout (10 seconds of no growth)
                if (retries > 10) {
                    console.log("ModelManager: Download stalled/dead. Cleaning up.");
                    clearInterval(pollInterval);
                    isDownloading = false;
                    ModelManager.notify();
                    await ModelManager.killGhostDownloads();
                }

            } catch (e) {
                clearInterval(pollInterval);
                isDownloading = false;
                ModelManager.notify();
            }
        }, 1000);
    }

    static async downloadModel(): Promise<string> {
        if (isDownloading) {
            console.log("ModelManager: Download already in progress");
            return ModelManager.getModelPath();
        }

        // Check for existing partial download that might be active
        const jobIdPath = ModelManager.getJobIdPath();
        const modelPath = ModelManager.getModelPath();

        if (await RNFS.exists(jobIdPath) && await RNFS.exists(modelPath)) {
            console.log("ModelManager: Found existing job, checking for liveness...");
            const s1 = await RNFS.stat(modelPath);
            const size1 = parseInt(s1.size);

            // Wait 2 seconds to see if it grows
            await new Promise(r => setTimeout(r, 2000));

            const s2 = await RNFS.stat(modelPath);
            const size2 = parseInt(s2.size);

            if (size2 > size1) {
                console.log("ModelManager: Existing download is ACTIVE. Resuming monitoring.");
                ModelManager.startMonitoring(modelPath, jobIdPath, size2);
                return modelPath;
            } else {
                console.log("ModelManager: Existing download is STALLED. Killing.");
            }
        }

        await ModelManager.killGhostDownloads();

        const toFile = ModelManager.getModelPath();
        console.log(`ModelManager: Starting download to ${toFile}`);

        isDownloading = true;
        progress = 0;
        ModelManager.notify();

        // Capture size
        let detectedSize = 0;
        let metaSaved = false;

        try {
            const ret = RNFS.downloadFile({
                fromUrl: MODEL_CONFIG.url,
                toFile: toFile,
                background: true,
                discretionary: false,
                progress: (res) => {
                    const prog = (res.bytesWritten / res.contentLength);
                    if (res.contentLength > 0) {
                        progress = prog;

                        // Save metadata once
                        if (!metaSaved) {
                            detectedSize = res.contentLength;
                            // Async write, fire and forget-ish
                            RNFS.writeFile(ModelManager.getMetaPath(), JSON.stringify({ expectedSize: res.contentLength }), 'utf8')
                                .then(() => console.log(`ModelManager: Saved expected size ${res.contentLength}`))
                                .catch(err => console.error("ModelManager: Failed to save meta", err));
                            metaSaved = true;
                        }

                    } else {
                        // Estimate if no header (fallback)
                        progress = Math.min(0.99, res.bytesWritten / MODEL_CONFIG.size);
                    }
                    ModelManager.notify();

                    if (res.bytesWritten % (10 * 1024 * 1024) < 10000) {
                        console.log(`ModelManager: Progress ${res.bytesWritten} / ${res.contentLength}`);
                    }
                },
            });

            await RNFS.writeFile(ModelManager.getJobIdPath(), ret.jobId.toString(), 'utf8');

            const result = await ret.promise;
            console.log("ModelManager: Download finished", result);

            await RNFS.unlink(ModelManager.getJobIdPath()).catch(() => { });

            if (result.statusCode !== 200) {
                throw new Error(`Download failed with status ${result.statusCode}`);
            }

            // Double check metadata was saved
            if (!metaSaved && detectedSize > 0) {
                await RNFS.writeFile(ModelManager.getMetaPath(), JSON.stringify({ expectedSize: detectedSize }), 'utf8');
            }

            progress = 1;
        } catch (e) {
            console.error(e);
            throw e;
        } finally {
            isDownloading = false;
            ModelManager.notify();
        }

        return toFile;
    }

    static async resumeDownloadIfActive(): Promise<void> {
        if (isDownloading) return;

        const jobIdPath = ModelManager.getJobIdPath();
        if (!(await RNFS.exists(jobIdPath))) return;

        console.log("ModelManager: Found existing job ID, checking for activity...");

        // Check if file acts alive
        const modelPath = ModelManager.getModelPath();
        if (!(await RNFS.exists(modelPath))) {
            await ModelManager.killGhostDownloads(); // File gone, job dead
            return;
        }

        // Monitoring Loop
        const stat = await RNFS.stat(modelPath);
        const lastSize = parseInt(stat.size);

        ModelManager.startMonitoring(modelPath, jobIdPath, lastSize);
    }
}
