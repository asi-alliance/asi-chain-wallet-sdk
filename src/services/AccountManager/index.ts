import Account, {
    TCreateAccountPayload,
    TEditableAccountOptions,
} from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";
import ItemManager from "@services/ItemManager";
import KeyDerivationService from "@services/KeyDerivation";
import { generateRandomId } from "@utils/index";

export interface ICreatedAccountData {
    accountId: string;
    account: Account;
}

export default class AccountManager extends ItemManager<Account> {
    private static orderAccounts(
        accounts: Map<string, Account>,
    ): Map<string, Account> {
        return new Map(
            Array.from(accounts).sort(
                (
                    [, firstAccount]: [string, Account],
                    [, secondAccount]: [string, Account],
                ) =>
                    KeyDerivationService.compareIndexes(
                        firstAccount.getIndex(),
                        secondAccount.getIndex(),
                    ),
            ),
        );
    }

    constructor(accounts: Map<string, Account> = new Map()) {
        super(AccountManager.orderAccounts(accounts));
    }

    private reorder(): void {
        const orderedAccounts: Map<string, Account> =
            AccountManager.orderAccounts(this.items);

        this.clear();
        this.addMany(orderedAccounts);
    }

    public async create(
        payload: TCreateAccountPayload,
        secretProvider: SecretsProvider,
    ): Promise<ICreatedAccountData> {
        const accountId: string = generateRandomId();
        const account = await Account.create(
            { id: accountId, ...payload },
            secretProvider,
        );

        this.add(accountId, account);
        this.reorder();

        return { account, accountId };
    }

    public addAccounts(accounts: Account[]): void {
        const entries: [string, Account][] = accounts.map(
            (account: Account) => [account.getId(), account],
        );

        this.addMany(entries);
        this.reorder();
    }

    public update(id: string, payload: TEditableAccountOptions): void {
        const account: Account | null = this.get(id);

        if (!account) {
            console.error("Cannot update missing account");

            return;
        }

        account.update(payload);
    }

    public getAccounts(): Account[] {
        return this.getAll();
    }

    public getAccountsMap(): Map<string, Account> {
        return this.getMap();
    }

    public getAccount(id: string): Account | null {
        return this.get(id);
    }
}
