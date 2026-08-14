import Account, { TCreateAccountPayload } from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";

export default class AccountsService {
    public static async createAccounts(
        accounts: TCreateAccountPayload[],
        secretProvider: SecretsProvider,
    ): Promise<Account[]> {
        const createdAccounts: Account[] = [];

        for (const accountOptions of accounts) {
            createdAccounts.push(
                await Account.create(accountOptions, secretProvider),
            );
        }

        return createdAccounts;
    }
}