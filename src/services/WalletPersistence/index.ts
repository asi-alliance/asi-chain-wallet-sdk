import type Account from "@domains/Account";
import { WalletAction } from "@domains/CustomError";
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
}
