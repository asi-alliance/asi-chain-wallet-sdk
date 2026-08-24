import Account from "@domains/Account";
import SecretsProvider, { TDecryptedSecret } from "@domains/SecretsProvider";
import type { Address, IImportKeyfileWalletPayload } from "@domains/Wallet";
import { WalletTypes } from "@domains/Signer";
import type { ISignerStorageRecord } from "@domains/SignersStorageRepository";
import type { IAccountStorageRecord } from "@domains/AccountsStorageRepository";
import {
    DuplicateWalletError,
    KeyfileWalletNotFoundError,
} from "@domains/CustomError";
import AccountsService from "@services/Accounts";
import ImportKeyfileService, {
    IImportWalletKeyfileOptions,
} from "@services/ImportKeyfileService";
import WalletUniquenessService from "@services/WalletUniqueness";

export enum KeyfileImportAccountStatus {
    NEW = "new",
    ALREADY_IMPORTED = "already-imported",
}

export interface IKeyfileImportAccountPreview {
    name: string;
    index: number | null;
    address: Address;
    status: KeyfileImportAccountStatus;
    existingAccountId: string | null;
}

export interface IKeyfileImportPreview {
    walletType: WalletTypes;
    existingSignerId: string | null;
    isExistingWalletOpen: boolean;
    accounts: IKeyfileImportAccountPreview[];
}

export interface IKeyfileImportPlan {
    payload: IImportKeyfileWalletPayload;
    secretProvider: SecretsProvider;
}

export interface IKeyfileAccountsImportPlan extends IKeyfileImportPlan {
    signerId: string;
}

interface IResolvedKeyfileImport extends IKeyfileImportPlan {
    existingSignerId: string | null;
}

export interface IKeyfileAccountsImportResult {
    signerId: string;
    importedAccountIds: string[];
}

export default class WalletImportService {
    private static async resolveKeyfileImport(
        source: unknown,
        passwordProvider: SecretsProvider,
        options?: IImportWalletKeyfileOptions,
    ): Promise<IResolvedKeyfileImport> {
        const payload: IImportKeyfileWalletPayload =
            await ImportKeyfileService.toImportPayload(
                ImportKeyfileService.parseWalletKeyfile(source),
                passwordProvider,
                options,
            );

        const secret: TDecryptedSecret =
            await ImportKeyfileService.decryptKeyfileSecret(
                payload.walletType,
                payload.encryptedSecret,
                passwordProvider,
            );

        const secretProvider: SecretsProvider = new SecretsProvider(
            () => secret,
        );

        const existingSigner: ISignerStorageRecord | null =
            await WalletUniquenessService.findSignerBySecret(secretProvider);

        if (existingSigner && payload.walletType === WalletTypes.PRIVATE_KEY) {
            throw new DuplicateWalletError(existingSigner.id);
        }

        return {
            payload,
            secretProvider,
            existingSignerId: existingSigner?.id ?? null,
        };
    }

    public static async prepareKeyfileImport(
        source: unknown,
        passwordProvider: SecretsProvider,
        options?: IImportWalletKeyfileOptions,
    ): Promise<IKeyfileImportPlan> {
        const { payload, secretProvider, existingSignerId } =
            await WalletImportService.resolveKeyfileImport(
                source,
                passwordProvider,
                options,
            );

        if (existingSignerId) {
            throw new DuplicateWalletError(existingSignerId);
        }

        return { payload, secretProvider };
    }

    public static async prepareKeyfileAccountsImport(
        source: unknown,
        passwordProvider: SecretsProvider,
        options?: IImportWalletKeyfileOptions,
    ): Promise<IKeyfileAccountsImportPlan> {
        const { payload, secretProvider, existingSignerId } =
            await WalletImportService.resolveKeyfileImport(
                source,
                passwordProvider,
                options,
            );

        if (!existingSignerId) {
            throw new KeyfileWalletNotFoundError();
        }

        return { payload, secretProvider, signerId: existingSignerId };
    }

    public static async previewKeyfileImport(
        source: unknown,
        passwordProvider: SecretsProvider,
    ): Promise<Omit<IKeyfileImportPreview, "isExistingWalletOpen">> {
        const {
            payload,
            secretProvider,
            existingSignerId,
        }: IResolvedKeyfileImport =
            await WalletImportService.resolveKeyfileImport(
                source,
                passwordProvider,
            );

        const accounts: Account[] = await AccountsService.createAccounts(
            payload.accounts,
            secretProvider,
        );

        const accountPreviews: IKeyfileImportAccountPreview[] = [];

        for (const account of accounts) {
            const existingAccount: IAccountStorageRecord | null =
                await WalletUniquenessService.findExistingAccount(account);

            accountPreviews.push({
                name: account.getName(),
                index: account.getIndex(),
                address: account.getAddress(),
                status: existingAccount
                    ? KeyfileImportAccountStatus.ALREADY_IMPORTED
                    : KeyfileImportAccountStatus.NEW,
                existingAccountId: existingAccount?.id ?? null,
            });
        }

        return {
            walletType: payload.walletType,
            existingSignerId,
            accounts: accountPreviews,
        };
    }
}
