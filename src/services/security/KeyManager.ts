import EncryptedStorage from 'react-native-encrypted-storage';
import { v4 as uuidv4 } from 'uuid';

export class KeyManager {
    private static KEY_ALIAS = 'kaikei_db_key_v1';

    /**
     * Retrieves the existing encryption key or generates a new one.
     */
    public static async getEncryptionKey(): Promise<string> {
        try {
            const existingKey = await EncryptedStorage.getItem(this.KEY_ALIAS);

            if (existingKey) {
                console.log("Encryption key retrieved from secure storage.");
                return existingKey;
            }

            console.log("No encryption key found. Generating new key...");
            // Generate a strong key. We can use UUID or a random bytes generator.
            // For stronger entropy, we could use a crypto lib, but UUID + timestamp is a decent start for now 
            // combined with the fact that op-sqlite handles the salting/hashing internally given a passphrase.
            const newKey = uuidv4() + '-' + Date.now().toString();

            await EncryptedStorage.setItem(this.KEY_ALIAS, newKey);
            console.log("New encryption key saved.");

            return newKey;
        } catch (error) {
            console.error("Failed to manage encryption key", error);
            throw new Error("Critical Security Error: Could not access KeyStore.");
        }
    }
}
