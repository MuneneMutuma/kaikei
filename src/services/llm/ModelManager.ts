import RNFS from 'react-native-fs';

export const MODEL_CONFIG = {
    name: 'llama-3.2-1b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q4_K_M-GGUF/resolve/main/llama-3.2-1b-instruct-q4_k_m.gguf',
    size: 800 * 1024 * 1024, // Approx 800MB (used for progress est if headers fail)
};

export class ModelManager {
    static getModelPath(): string {
        return `${RNFS.DocumentDirectoryPath}/${MODEL_CONFIG.name}`;
    }

    static async isModelReady(): Promise<boolean> {
        const path = this.getModelPath();
        const exists = await RNFS.exists(path);
        if (!exists) return false;

        const stat = await RNFS.stat(path);
        // Basic integrity check: > 100MB
        return stat.size > 100 * 1024 * 1024;
    }

    static async downloadModel(
        onProgress: (progress: number) => void
    ): Promise<string> {
        const toFile = this.getModelPath();

        // Ensure directory exists (DocumentDirectory usually exists, but safe to check)
        // RNFS.mkdir isn't strictly needed for DocumentDirectory root but good practice if we used a subdir

        console.log(`ModelManager: Starting download to ${toFile}`);

        const ret = RNFS.downloadFile({
            fromUrl: MODEL_CONFIG.url,
            toFile: toFile,
            background: true,
            discretionary: false,
            // Cache headers if needed, generally HuggingFace handles standard requests
            progress: (res) => {
                const progress = (res.bytesWritten / res.contentLength);
                if (res.contentLength > 0) {
                    onProgress(progress);
                } else {
                    onProgress(Math.min(0.99, res.bytesWritten / MODEL_CONFIG.size));
                }

                // Logging every ~10% could be noisy, so maybe just standard logs
                if (res.bytesWritten % (10 * 1024 * 1024) < 10000) { // rough log every 10MB chunk boundary
                    console.log(`ModelManager: Progress ${res.bytesWritten} / ${res.contentLength}`);
                }
            },
        });

        const result = await ret.promise;
        console.log("ModelManager: Download finished", result);

        if (result.statusCode !== 200) {
            throw new Error(`Download failed with status ${result.statusCode} (Bytes: ${result.bytesWritten})`);
        }

        return toFile;
    }

    static async deleteModel(): Promise<void> {
        const path = this.getModelPath();
        if (await RNFS.exists(path)) {
            await RNFS.unlink(path);
        }
    }
}
