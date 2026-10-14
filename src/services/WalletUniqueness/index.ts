import type Account from "@domains/Account";
import type Wallet from "@domains/Wallet";
import type SecretsProvider from "@domains/SecretsProvider";
import type { TDecryptedSecret } from "@domains/SecretsProvider";
import type { ISignerStorageRecord } from "@domains/SignersStorageRepository";
import type { IAccountStorageRecord } from "@domains/AccountsStorageRepository";
import {
    DuplicateAccountError,
    DuplicateWalletError,
} from "@domains/CustomError";
import KeyFingerprintService from "@services/KeyFingerprint";
import LegacyFingerprintService from "@services/LegacyFingerprint";
import StorageManager from "@services/StorageManager";

export default class WalletUniquenessService {
    public static async findSignerBySecret(
        secretProvider: SecretsProvider,
    ): Promise<ISignerStorageRecord | null> {
        const secret: TDecryptedSecret = secretProvider.getSecret();

        const signer: ISignerStorageRecord | null =
            await StorageManager.findSignerByFingerprint(
                await KeyFingerprintService.fromSecret(secret),
            );

        // TODO(next-major): Return the fingerprint lookup alone once
        // LegacyFingerprintService is removed.
        return signer ?? LegacyFingerprintService.findSignerBySecret(secret);
    }

    public static async findExistingAccount(
        account: Account,
    ): Promise<IAccountStorageRecord | null> {
        return StorageManager.findAccountByFingerprint(
            account.getFingerprint(),
        );
    }

    public static async assertAccountIsNotDuplicate(
        account: Account,
    ): Promise<void> {
        const existingAccount: IAccountStorageRecord | null =
            await WalletUniquenessService.findExistingAccount(account);

        if (existingAccount) {
            throw new DuplicateAccountError(
                existingAccount.signerId,
                existingAccount.id,
            );
        }
    }

    public static async assertWalletIsNotDuplicate(
        wallet: Wallet,
    ): Promise<void> {
        const existingSigner: ISignerStorageRecord | null =
            await StorageManager.findSignerByFingerprint(
                wallet.getSigner().getFingerprint(),
            );

        if (existingSigner) {
            throw new DuplicateWalletError(existingSigner.id);
        }

        for (const account of wallet.getAccounts()) {
            await WalletUniquenessService.assertAccountIsNotDuplicate(account);
        }
    }
}
