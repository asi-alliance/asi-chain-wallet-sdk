import CryptoJS from "crypto-js";

export type Base64 = string;
export type Ciphertext = string;
export type WordArray = CryptoJS.lib.WordArray;

export interface EncryptedData {
    salt: Base64;
    iv: Base64;
    data: Ciphertext;
    version: number;
}

export interface CryptoConfig {
    readonly VERSION: number;
    readonly KEY_SIZE_WORDS: number;
    readonly SALT_LENGTH: number;
    readonly IV_LENGTH: number;
    readonly KEY_DERIVATION_ITERATIONS: number;
    readonly CIPHER: string;
    readonly KDF: string;
}

const CryptoConfig: CryptoConfig = {
    VERSION: 1, // change this when making incompatible changes
    KEY_SIZE_WORDS: 8, // 256 bits = 32 bytes = 8 words
    SALT_LENGTH: 16,
    IV_LENGTH: 12,
    KEY_DERIVATION_ITERATIONS: 200000,
    CIPHER: "AES", // change CryptoJS.AES occurrences if changing
    KDF: "PBKDF2", // change CryptoJS.PBKDF2 occurrences if changing
};

export default class CryptoService {
    public static encryptWithPassword(
        data: string,
        passphrase: string
    ): EncryptedData {
        const salt: WordArray = this.generateSalt();
        const key: WordArray = this.deriveKey(passphrase, salt);
        const iv: WordArray = this.generateIV();
        const encryptedData: Ciphertext = CryptoJS.AES.encrypt(data, key, {
            iv,
        }).toString();

        return {
            version: CryptoConfig.VERSION,
            salt: CryptoJS.enc.Base64.stringify(salt),
            iv: CryptoJS.enc.Base64.stringify(iv),
            data: encryptedData,
        };
    }

    public static decryptWithPassword(
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

    private static generateSalt(): WordArray {
        return CryptoJS.lib.WordArray.random(CryptoConfig.SALT_LENGTH);
    }

    private static generateIV(): WordArray {
        return CryptoJS.lib.WordArray.random(CryptoConfig.IV_LENGTH);
    }

    private static deriveKey(passphrase: string, salt: WordArray): WordArray {
        return CryptoJS.PBKDF2(passphrase, salt, {
            keySize: CryptoConfig.KEY_SIZE_WORDS,
            iterations: CryptoConfig.KEY_DERIVATION_ITERATIONS,
        });
    }
}
