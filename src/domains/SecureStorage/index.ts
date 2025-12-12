import CryptoJS from "crypto-js";

export type Base64 = string;
export type Ciphertext = string;
export type WordArray = CryptoJS.lib.WordArray;

export interface SecureWebWalletsStorageConfig {
    readonly VERSION: number;
    readonly STORAGE_PREFIX: string;
    readonly KEY_SIZE_WORDS: number;
    readonly SALT_LENGTH: number;
    readonly IV_LENGTH: number;
    readonly KEY_DERIVATION_ITERATIONS: number;
    readonly CIPHER: string;
    readonly KDF: string;
}

const SecureWebWalletsStorageConfig: SecureWebWalletsStorageConfig = {
    VERSION: 1,// change this when making incompatible changes
    STORAGE_PREFIX: "asi_web_secure_wallet_storage_",
    KEY_SIZE_WORDS: 8, // 256 bits = 32 bytes = 8 words
    SALT_LENGTH: 16,
    IV_LENGTH: 12,
    KEY_DERIVATION_ITERATIONS: 200000,
    CIPHER: "AES", // change CryptoJS.AES occurrences if changing
    KDF: "PBKDF2", // change CryptoJS.PBKDF2 occurrences if changing
};

export interface WalletData {
    id: string;
    address: string;
    privateKey: string;
    derivationIndex: number;
}

export interface EncryptedData {
    salt: Base64;
    iv: Base64;
    data: Ciphertext;
    version: number;
}

export default class SecureWebWalletsStorage {
    private masterKeyStorageKey: string = `${SecureWebWalletsStorageConfig.STORAGE_PREFIX}master`;

    private createWalletStorageKey(walletId: string): string {
        return `${SecureWebWalletsStorageConfig.STORAGE_PREFIX}${walletId}`;
    }

    private generateSalt(): WordArray {
        return CryptoJS.lib.WordArray.random(
            SecureWebWalletsStorageConfig.SALT_LENGTH
        );
    }

    private generateIV(): WordArray {
        return CryptoJS.lib.WordArray.random(
            SecureWebWalletsStorageConfig.IV_LENGTH
        );
    }

    private deriveKey(passphrase: string, salt: WordArray): WordArray {
        return CryptoJS.PBKDF2(passphrase, salt, {
            keySize: SecureWebWalletsStorageConfig.KEY_SIZE_WORDS,
            iterations: SecureWebWalletsStorageConfig.KEY_DERIVATION_ITERATIONS,
        });
    }

    private encryptWithPass(data: string, passphrase: string): EncryptedData {
        const salt: WordArray = this.generateSalt();
        const key: WordArray = this.deriveKey(passphrase, salt);
        const iv: WordArray = this.generateIV();
        const encryptedData: Ciphertext = CryptoJS.AES.encrypt(data, key, {
            iv,
        }).toString();

        return {
            version: SecureWebWalletsStorageConfig.VERSION,
            salt: CryptoJS.enc.Base64.stringify(salt),
            iv: CryptoJS.enc.Base64.stringify(iv),
            data: encryptedData,
        };
    }

    private decryptWithPass(
        payload: EncryptedData,
        passphrase: string
    ): string {
        const salt: WordArray = CryptoJS.enc.Base64.parse(payload.salt);
        const iv: WordArray = CryptoJS.enc.Base64.parse(payload.iv);
        const key: WordArray = this.deriveKey(passphrase, salt);
        const decrypted: string = CryptoJS.AES.decrypt(payload.data, key, {
            iv,
        }).toString(CryptoJS.enc.Utf8);

        if (!decrypted) {
            throw new Error("Decryption failed");
        }

        return decrypted;
    }

    public saveMasterKey(masterKey: string, passphrase: string): void {
        const payload: EncryptedData = this.encryptWithPass(
            masterKey,
            passphrase
        );

        localStorage.setItem(this.masterKeyStorageKey, JSON.stringify(payload));
    }

    public loadMasterKey(passphrase: string): string | null {
        const raw = localStorage.getItem(this.masterKeyStorageKey);

        if (!raw) {
            return null;
        }

        const payload: EncryptedData = JSON.parse(raw);

        try {
            return this.decryptWithPass(payload, passphrase);
        } catch {
            return null;
        }
    }

    public deleteMasterKey(): void {
        localStorage.removeItem(this.masterKeyStorageKey);
    }

    public hasMasterKey(): boolean {
        return localStorage.getItem(this.masterKeyStorageKey) !== null;
    }

    public saveWallet(
        walletId: string,
        data: WalletData,
        passphrase: string
    ): void {
        const payload: EncryptedData = this.encryptWithPass(
            JSON.stringify(data),
            passphrase
        );

        localStorage.setItem(
            this.createWalletStorageKey(walletId),
            JSON.stringify(payload)
        );
    }

    public loadWallet(walletId: string, passphrase: string): WalletData | null {
        const raw: string | null = localStorage.getItem(
            this.createWalletStorageKey(walletId)
        );

        if (!raw) {
            return null;
        }

        const payload: EncryptedData = JSON.parse(raw);

        try {
            const decrypted = this.decryptWithPass(payload, passphrase);
            return JSON.parse(decrypted);
        } catch {
            return null;
        }
    }

    public deleteWallet(walletId: string): void {
        localStorage.removeItem(this.createWalletStorageKey(walletId));
    }

    public getAllWalletsIds(): string[] {
        const output: string[] = [];

        for (let i: number = 0; i < localStorage.length; i++) {
            const localStorageKey: string | null = localStorage.key(i);

            if (!localStorageKey) {
                continue;
            }

            if (
                !localStorageKey.startsWith(
                    SecureWebWalletsStorageConfig.STORAGE_PREFIX
                )
            ) {
                continue;
            }

            if (localStorageKey === this.masterKeyStorageKey) {
                continue;
            }

            output.push(
                localStorageKey.slice(
                    SecureWebWalletsStorageConfig.STORAGE_PREFIX.length
                )
            );
        }

        return output;
    }

    public hasWallet(walletId: string): boolean {
        return (
            localStorage.getItem(this.createWalletStorageKey(walletId)) !== null
        );
    }

    public hasWallets(): boolean {
        for (let i: number = 0; i < localStorage.length; i++) {
            const localStorageKey: string | null = localStorage.key(i);

            if (!localStorageKey) {
                continue;
            }

            if (
                localStorageKey.startsWith(
                    SecureWebWalletsStorageConfig.STORAGE_PREFIX
                ) &&
                localStorageKey !== this.masterKeyStorageKey
            ) {
                return true;
            }
        }

        return false;
    }

    public clear(): void {
        for (let i: number = 0; i < localStorage.length; i++) {
            const localStorageKey: string | null = localStorage.key(i);

            if (!localStorageKey) {
                continue;
            }

            if (
                localStorageKey.startsWith(
                    SecureWebWalletsStorageConfig.STORAGE_PREFIX
                )
            ) {
                localStorage.removeItem(localStorageKey);
            }
        }
    }
}
