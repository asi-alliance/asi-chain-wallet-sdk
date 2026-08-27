import Bip44Path from "@domains/Bip44Path";
import {
    CorruptedDataError,
    CorruptedDataSource,
    InvalidPasswordError,
    KeyDerivationError,
    UnknownErrorReason,
    UnsupportedEncryptionVersionError,
} from "@domains/CustomError";
import SecretsProvider, {
    IHDSecret,
    IPrivateKeyCredentials,
    TStoredSecret,
} from "@domains/SecretsProvider";
import {
    arrayBufferToBase64,
    base64ToArrayBuffer,
    toUint8Array,
} from "@utils/codec";
import { isStoredSecret } from "@utils/guards";
import { getErrorMessage, parseDecryptedJson } from "@utils/functions";

const enum KeyUsage {
    ENCRYPT = "encrypt",
    DECRYPT = "decrypt",
    DERIVATION = "deriveKey",
}

export type CryptoConfig = {
    readonly VERSION: number;
    readonly IV_LENGTH: number;
    readonly SALT_LENGTH: number;
    readonly AUTH_TAG_LENGTH: number;
    readonly DATA_KEY_LENGTH: number;
    readonly KEY_SIZE_BITS: number;
    readonly KEY_IMPORT_FORMAT: "raw" | "pkcs8" | "spki";
    readonly KEY_DERIVATION_ITERATIONS: number;
    readonly KEY_DERIVATION_FUNCTION: string;
    readonly KEY_IMPORT_USAGE: KeyUsage[];
    readonly HASH_FUNCTION: string;
    readonly ALGORITHM: string;
};

export type EncryptedData = {
    data: string;
    salt: string;
    iv: string;
    version: number;
};

export interface IDecodeEncryptedFieldConfig {
    minimalLength?: number;
    length?: number;
}

const CryptoConfig: CryptoConfig = {
    VERSION: 2,
    IV_LENGTH: 12,
    SALT_LENGTH: 16,
    AUTH_TAG_LENGTH: 16,
    DATA_KEY_LENGTH: 32,
    KEY_SIZE_BITS: 256,
    ALGORITHM: "AES-GCM",
    HASH_FUNCTION: "SHA-256",
    KEY_IMPORT_FORMAT: "raw",
    KEY_DERIVATION_FUNCTION: "PBKDF2",
    KEY_DERIVATION_ITERATIONS: 100_000,
    KEY_IMPORT_USAGE: [KeyUsage.ENCRYPT, KeyUsage.DECRYPT],
};

export default class CryptoService {
    public static generateDataKeySecret(): string {
        const material: ArrayBuffer = new ArrayBuffer(
            CryptoConfig.DATA_KEY_LENGTH,
        );

        crypto.getRandomValues(new Uint8Array(material));

        return arrayBufferToBase64(material);
    }

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

    private static decodeEncryptedField(
        value: string,
        source: CorruptedDataSource,
        config: IDecodeEncryptedFieldConfig,
    ): Uint8Array<ArrayBuffer> {
        let field: Uint8Array<ArrayBuffer>;

        try {
            field = new Uint8Array(base64ToArrayBuffer(value));
        } catch {
            throw new CorruptedDataError(source);
        }

        if (config.minimalLength && field.length < config.minimalLength) {
            throw new CorruptedDataError(source);
        }

        if (config.length && field.length !== config.length) {
            throw new CorruptedDataError(source);
        }

        return field;
    }

    public static async decryptWithPassword(
        payload: EncryptedData,
        passphrase: string,
    ): Promise<string> {
        if (payload.version !== CryptoConfig.VERSION) {
            throw new UnsupportedEncryptionVersionError(
                payload.version,
                CryptoConfig.VERSION,
            );
        }

        const salt = this.decodeEncryptedField(
            payload.salt,
            CorruptedDataSource.ENCRYPTED_SALT,
            {
                length: CryptoConfig.SALT_LENGTH,
            },
        );
        const iv = this.decodeEncryptedField(
            payload.iv,
            CorruptedDataSource.ENCRYPTED_IV,
            {
                length: CryptoConfig.IV_LENGTH,
            },
        );
        const content = this.decodeEncryptedField(
            payload.data,
            CorruptedDataSource.ENCRYPTED_CONTENT,
            {
                minimalLength: CryptoConfig.AUTH_TAG_LENGTH,
            },
        );

        const key: CryptoKey = await this.deriveKey(passphrase, salt);

        let decrypted: ArrayBuffer;

        try {
            decrypted = await crypto.subtle.decrypt(
                { name: CryptoConfig.ALGORITHM, iv },
                key,
                content,
            );
        } catch {
            throw new InvalidPasswordError();
        }

        return new TextDecoder().decode(decrypted);
    }

    public static async decryptSignerData(
        signerData: EncryptedData,
        passwordProvider: SecretsProvider,
    ): Promise<IHDSecret | IPrivateKeyCredentials> {
        const stringifiedKeyMaterial: string =
            await CryptoService.decryptWithPassword(
                signerData,
                passwordProvider.getSecret().password,
            );

        const keyMaterial: TStoredSecret = parseDecryptedJson(
            stringifiedKeyMaterial,
            CorruptedDataSource.WALLET_SECRET,
            isStoredSecret,
        );

        if ("privateKey" in keyMaterial) {
            const privateKey: Uint8Array = toUint8Array(keyMaterial.privateKey);

            return {
                privateKey,
            };
        }

        const path: Bip44Path = Bip44Path.parse(keyMaterial.rootHDPath);

        return {
            seed: keyMaterial.seed,
            rootHDPath: path,
        };
    }

    public static async deriveKey(
        password: string,
        salt: Uint8Array,
    ): Promise<CryptoKey> {
        try {
            const keyMaterial = await crypto.subtle.importKey(
                CryptoConfig.KEY_IMPORT_FORMAT,
                new TextEncoder().encode(password),
                CryptoConfig.KEY_DERIVATION_FUNCTION,
                false,
                [KeyUsage.DERIVATION],
            );

            return await crypto.subtle.deriveKey(
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
        } catch (error: unknown) {
            throw new KeyDerivationError(
                getErrorMessage(error, UnknownErrorReason.CRYPTO),
            );
        }
    }
}
