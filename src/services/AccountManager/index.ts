import Account, {
    TCreateAccountPayload,
    TEditableAccountOptions,
} from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";
import ItemManager from "@services/ItemManager";
import { generateRandomId } from "@utils/index";

export interface ICreatedAccountData {
    accountId: string;
    account: Account;
}

export default class AccountManager extends ItemManager<Account> {
    private activeAccount: Account | null;

    constructor(
        accounts: Map<string, Account> = new Map(),
        activeAccount: Account | null = null,
    ) {
        super(accounts);

        this.activeAccount =
            activeAccount ?? accounts.values().next().value ?? null;
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

        if (!this.activeAccount) {
            this.activeAccount = account;
        }

        return { account, accountId };
    }

    public remove(id: string): boolean {
        const account: Account | null = this.get(id);

        if (!account) {
            return false;
        }

        const deleted: boolean = super.remove(id);

        if (this.activeAccount === account && !this.items.size) {
            return deleted;
        }

        this.activeAccount = this.items.values().next().value ?? null;

        return deleted;
    }

    public update(id: string, payload: TEditableAccountOptions): void {
        const account: Account | null = this.get(id);

        if (!account) {
            console.error("Cannot update missing account");

            return;
        }

        account.update(payload);
    }

    public setActiveAccount(id: string): void {
        const account: Account | null = this.get(id);

        if (!account) {
            console.error("Cannot set active account");

            return;
        }

        this.activeAccount = account;
    }

    public getActiveAccount(): Account | null {
        return this.activeAccount;
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
