import { arrayBufferToBase64, base64ToArrayBuffer } from "@utils/codec";

const enum KeyUsage {
    ENCRYPT = "encrypt",
    DECRYPT = "decrypt",
    DERIVATION = "deriveKey",
}

export interface CryptoConfig {
    readonly VERSION: number;
    readonly IV_LENGTH: number;
    readonly SALT_LENGTH: number;
    readonly KEY_SIZE_BITS: number;
    readonly KEY_IMPORT_FORMAT: "raw" | "pkcs8" | "spki";
    readonly KEY_DERIVATION_ITERATIONS: number;
    readonly KEY_DERIVATION_FUNCTION: string;
    readonly KEY_IMPORT_USAGE: KeyUsage[];
    readonly HASH_FUNCTION: string;
    readonly ALGORITHM: string;
}

export interface EncryptedData {
    data: string;
    salt: string;
    iv: string;
    version: number;
}

const CryptoConfig: CryptoConfig = {
    VERSION: 2,
    IV_LENGTH: 12,
    SALT_LENGTH: 16,
    KEY_SIZE_BITS: 256,
    ALGORITHM: "AES-GCM",
    HASH_FUNCTION: "SHA-256",
    KEY_IMPORT_FORMAT: "raw",
    KEY_DERIVATION_FUNCTION: "PBKDF2",
    KEY_DERIVATION_ITERATIONS: 100_000,
    KEY_IMPORT_USAGE: [KeyUsage.ENCRYPT, KeyUsage.DECRYPT],
};

export default class CryptoService {
    public static async encryptWithPassword(
        data: string,
        password: string,
    ): Promise<EncryptedData> {
        const salt = crypto.getRandomValues(
            new Uint8Array(CryptoConfig.SALT_LENGTH),
        );
        const iv = crypto.getRandomValues(
            new Uint8Array(CryptoConfig.IV_LENGTH),
        );

        const key = await this.deriveKey(password, salt);

        const encrypted = await crypto.subtle.encrypt(
            { name: CryptoConfig.ALGORITHM, iv },
            key,
            new TextEncoder().encode(data),
        );

        return {
            data: arrayBufferToBase64(encrypted),
            salt: arrayBufferToBase64(salt.buffer),
            iv: arrayBufferToBase64(iv.buffer),
            version: CryptoConfig.VERSION,
        };
    }

    public static async decryptWithPassword(
        payload: EncryptedData,
        passphrase: string,
    ): Promise<string> {
        if (payload.version !== CryptoConfig.VERSION) {
            throw new Error(`Unsupported version ${payload.version}`);
        }

        const salt = new Uint8Array(base64ToArrayBuffer(payload.salt));
        const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));

        const key = await this.deriveKey(passphrase, salt);

        const decrypted = await crypto.subtle.decrypt(
            { name: CryptoConfig.ALGORITHM, iv },
            key,
            base64ToArrayBuffer(payload.data),
        );

        return new TextDecoder().decode(decrypted);
    }

    public static async deriveKey(
        password: string,
        salt: Uint8Array,
    ): Promise<CryptoKey> {
        const keyMaterial = await crypto.subtle.importKey(
            CryptoConfig.KEY_IMPORT_FORMAT,
            new TextEncoder().encode(password),
            CryptoConfig.KEY_DERIVATION_FUNCTION,
            false,
            [KeyUsage.DERIVATION],
        );

        return crypto.subtle.deriveKey(
            {
                name: CryptoConfig.KEY_DERIVATION_FUNCTION,
                salt: new Uint8Array(salt),
                iterations: CryptoConfig.KEY_DERIVATION_ITERATIONS,
                hash: CryptoConfig.HASH_FUNCTION,
            },
            keyMaterial,
            {
                name: CryptoConfig.ALGORITHM,
                length: CryptoConfig.KEY_SIZE_BITS,
            },
            false,
            [KeyUsage.ENCRYPT, KeyUsage.DECRYPT],
        );
    }
}
