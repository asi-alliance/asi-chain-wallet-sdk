import { EncryptedSecretMaterial } from "../modules/StorageAdapter";

const CRYPTO_CONFIG = {
    algorithm: "AES-GCM",
    ivLength: 12,
    saltLength: 16,
    keyLength: 256,
    iterations: 150_000,
    hash: "SHA-256",
};

export class CryptoService {
    public static async sealSecret(
        secret: Uint8Array,
        password: string,
    ): Promise<EncryptedSecretMaterial> {
        const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.ivLength));
        const salt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.saltLength));
        const key = await this.deriveKey(password, salt);
        const encrypted = await crypto.subtle.encrypt(
            { name: CRYPTO_CONFIG.algorithm, iv },
            key,
            secret,
        );

        return {
            version: 1,
            iv: this.toBase64(iv),
            salt: this.toBase64(salt),
            data: this.toBase64(new Uint8Array(encrypted)),
        };
    }

    public static async openSecret(
        payload: EncryptedSecretMaterial,
        password: string,
    ): Promise<Uint8Array> {
        const iv = this.fromBase64(payload.iv);
        const salt = this.fromBase64(payload.salt);
        const key = await this.deriveKey(password, salt);
        const decrypted = await crypto.subtle.decrypt(
            { name: CRYPTO_CONFIG.algorithm, iv },
            key,
            this.fromBase64(payload.data),
        );

        return new Uint8Array(decrypted);
    }

    private static async deriveKey(
        password: string,
        salt: Uint8Array,
    ): Promise<CryptoKey> {
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"],
        );

        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt,
                iterations: CRYPTO_CONFIG.iterations,
                hash: CRYPTO_CONFIG.hash,
            },
            keyMaterial,
            { name: CRYPTO_CONFIG.algorithm, length: CRYPTO_CONFIG.keyLength },
            false,
            ["encrypt", "decrypt"],
        );
    }

    private static toBase64(data: Uint8Array): string {
        return btoa(String.fromCharCode(...data));
    }

    private static fromBase64(value: string): Uint8Array {
        const binary = atob(value);
        return new Uint8Array(Array.from(binary).map((char) => char.charCodeAt(0)));
    }
}
