import type Account from "@domains/Account";
import type { TCreateAccountPayload } from "@domains/Account";
import type SecretsProvider from "@domains/SecretsProvider";
import { WalletAction } from "@domains/CustomError";
import AccountsService from "@services/Accounts";
import StorageManager from "@services/StorageManager";
import WalletOperationGuardService from "@services/WalletOperationGuard";
import WalletUniquenessService from "@services/WalletUniqueness";

export default class WalletPersistenceService {
    public static async saveAccounts(
        signerId: string,
        accounts: Account[],
    ): Promise<void> {
        return WalletOperationGuardService.getInstance().runWalletAction(
            WalletAction.SAVE_ACCOUNTS,
            signerId,
            async () => {
                for (const account of accounts) {
                    await WalletUniquenessService.assertAccountIsNotDuplicate(
                        account,
                    );
                }

                await StorageManager.saveAccounts(
                    accounts.map((account: Account) => ({
                        id: account.getId(),
                        account,
                        signerId,
                    })),
                );
            },
        );
    }

    public static async createAccounts(
        signerId: string,
        accounts: TCreateAccountPayload[],
        secretProvider: SecretsProvider,
    ): Promise<Account[]> {
        const createdAccounts: Account[] = await AccountsService.createAccounts(
            accounts,
            secretProvider,
        );

        await WalletPersistenceService.saveAccounts(signerId, createdAccounts);

        return createdAccounts;
    }
}
