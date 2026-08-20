import Account from "@domains/Account";
import SecretsProvider, { TDecryptedSecret } from "@domains/SecretsProvider";
import type Wallet from "@domains/Wallet";
import type { Address, IImportKeyfileWalletPayload } from "@domains/Wallet";
import { WalletTypes } from "@domains/Signer";
import type { ISignerStorageRecord } from "@domains/SignersStorageRepository";
import type { IAccountStorageRecord } from "@domains/AccountsStorageRepository";
import { DuplicateWalletError } from "@domains/CustomError";
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
    existingSignerId: string | null;
}

export interface IKeyfileImportResult {
    signerId: string;
    isMergedIntoExistingWallet: boolean;
    importedAccountIds: string[];
    wallet: Wallet | null;
}

export default class WalletImportService {
    public static async prepareKeyfileImport(
        source: unknown,
        passwordProvider: SecretsProvider,
        options?: IImportWalletKeyfileOptions,
    ): Promise<IKeyfileImportPlan> {
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

    public static async previewKeyfileImport(
        source: unknown,
        passwordProvider: SecretsProvider,
    ): Promise<Omit<IKeyfileImportPreview, "isExistingWalletOpen">> {
        const {
            payload,
            secretProvider,
            existingSignerId,
        }: IKeyfileImportPlan = await WalletImportService.prepareKeyfileImport(
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
