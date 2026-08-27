import {
    InvalidKeyfileError,
    InvalidKeyfilePasswordError,
    InvalidPasswordError,
} from "@domains/CustomError";
import SecretsProvider, { TDecryptedSecret } from "@domains/SecretsProvider";
import { WalletTypes } from "@domains/Signer";
import type { IImportKeyfileWalletPayload } from "@domains/Wallet";
import type { IKeyfileWalletAccount } from "@services/KeyfileSerializer";
import CryptoService, { EncryptedData } from "@services/Crypto";
import type { IWalletKeyfile } from "@services/ExportKeyfileService";
import {
    isEncryptedData,
    isKeyfileWalletAccount,
    isPrivateKeySecretData,
} from "@utils/guards";
import { selectByField } from "@utils/functions";
import { ASI_WALLET_KEYFILE_VERSION, KeyfileTypes } from "@config/index";

export interface IImportWalletKeyfileOptions {
    accountIndexes?: number[];
}

export default class ImportKeyfileService {
    public static fromJSON(source: string): unknown {
        try {
            return JSON.parse(source);
        } catch {
            throw new InvalidKeyfileError("Keyfile is not a valid JSON");
        }
    }

    private static validateWalletKeyfile(source: unknown): {
        isValid: boolean;
        error?: string;
    } {
        if (typeof source !== "object" || source === null) {
            return { isValid: false, error: "Keyfile is not an object" };
        }

        const keyfile = source as IWalletKeyfile;

        if (keyfile.type !== KeyfileTypes.WALLET) {
            return { isValid: false, error: "Keyfile has an unknown type" };
        }

        if (keyfile.version !== ASI_WALLET_KEYFILE_VERSION) {
            return {
                isValid: false,
                error: `Keyfile version ${keyfile.version} is not supported`,
            };
        }

        if (!Object.values(WalletTypes).includes(keyfile.walletType)) {
            return {
                isValid: false,
                error: "Keyfile has an unknown wallet type",
            };
        }

        if (!isEncryptedData(keyfile.encryptedPrivateData)) {
            return {
                isValid: false,
                error: "Keyfile has no encrypted private data",
            };
        }

        if (!isEncryptedData(keyfile.encryptedAccounts)) {
            return {
                isValid: false,
                error: "Keyfile has no encrypted accounts",
            };
        }

        return { isValid: true };
    }

    private static validateWalletKeyfileAccounts(
        source: unknown,
        walletType: WalletTypes,
    ): { isValid: boolean; error?: string } {
        if (
            !Array.isArray(source) ||
            !source.length ||
            !source.every(isKeyfileWalletAccount)
        ) {
            return { isValid: false, error: "Keyfile has no valid accounts" };
        }

        if (walletType === WalletTypes.PRIVATE_KEY && source.length > 1) {
            return {
                isValid: false,
                error: "Private key keyfile must contain a single account",
            };
        }

        const indexes: (number | null)[] = source.map(
            (account: IKeyfileWalletAccount) => account.index,
        );

        if (new Set(indexes).size !== indexes.length) {
            return {
                isValid: false,
                error: "Keyfile contains duplicate accounts",
            };
        }

        return { isValid: true };
    }

    public static parseWalletKeyfile(source: unknown): IWalletKeyfile {
        const keyfileSource: unknown =
            typeof source === "string"
                ? ImportKeyfileService.fromJSON(source)
                : source;

        const { isValid, error } =
            ImportKeyfileService.validateWalletKeyfile(keyfileSource);

        if (!isValid) {
            throw new InvalidKeyfileError(error);
        }

        return keyfileSource as IWalletKeyfile;
    }

    public static async decryptKeyfileAccounts(
        keyfile: IWalletKeyfile,
        passwordProvider: SecretsProvider,
    ): Promise<IKeyfileWalletAccount[]> {
        let serializedAccounts: string;

        try {
            serializedAccounts = await CryptoService.decryptWithPassword(
                keyfile.encryptedAccounts,
                passwordProvider.getSecret().password,
            );
        } catch (error: unknown) {
            if (error instanceof InvalidPasswordError) {
                throw new InvalidKeyfilePasswordError();
            }

            throw error;
        }

        const accounts: unknown =
            ImportKeyfileService.fromJSON(serializedAccounts);

        const { isValid, error } =
            ImportKeyfileService.validateWalletKeyfileAccounts(
                accounts,
                keyfile.walletType,
            );

        if (!isValid) {
            throw new InvalidKeyfileError(error);
        }

        return accounts as IKeyfileWalletAccount[];
    }

    private static selectAccounts(
        accounts: IKeyfileWalletAccount[],
        accountIndexes?: number[],
    ): IKeyfileWalletAccount[] {
        if (!accountIndexes) {
            return accounts;
        }

        if (!accountIndexes.length) {
            throw new InvalidKeyfileError(
                "No keyfile accounts selected for import",
            );
        }

        const { selected, missingValues } = selectByField(
            accounts,
            "index",
            accountIndexes,
        );

        if (missingValues.length) {
            throw new InvalidKeyfileError(
                `Keyfile has no accounts with indexes ${missingValues.join(", ")}`,
            );
        }

        return selected;
    }

    public static async toImportPayload(
        keyfile: IWalletKeyfile,
        passwordProvider: SecretsProvider,
        options?: IImportWalletKeyfileOptions,
    ): Promise<IImportKeyfileWalletPayload> {
        const accounts: IKeyfileWalletAccount[] =
            await ImportKeyfileService.decryptKeyfileAccounts(
                keyfile,
                passwordProvider,
            );

        const selectedAccounts: IKeyfileWalletAccount[] =
            ImportKeyfileService.selectAccounts(
                accounts,
                options?.accountIndexes,
            );

        return {
            walletType: keyfile.walletType,
            encryptedSecret: keyfile.encryptedPrivateData,
            accounts: selectedAccounts.map(
                ({ name, index }: IKeyfileWalletAccount) => ({
                    name,
                    index: index ?? undefined,
                }),
            ),
        };
    }

    public static async decryptKeyfileSecret(
        walletType: WalletTypes,
        encryptedSecret: EncryptedData,
        passwordProvider: SecretsProvider,
    ): Promise<TDecryptedSecret> {
        let secret: TDecryptedSecret;

        try {
            secret = await CryptoService.decryptSignerData(
                encryptedSecret,
                passwordProvider,
            );
        } catch (error: unknown) {
            if (error instanceof InvalidPasswordError) {
                throw new InvalidKeyfilePasswordError();
            }

            throw error;
        }

        const isPrivateKeyWalletKeyfile: boolean =
            walletType === WalletTypes.PRIVATE_KEY;

        if (isPrivateKeySecretData(secret) !== isPrivateKeyWalletKeyfile) {
            throw new InvalidKeyfileError(
                "Keyfile secret does not match its wallet type",
            );
        }

        return secret;
    }
}
