import Account, {
    TCreateAccountPayload,
    TEditableAccountOptions,
} from "../../domains/Account";
import SecretsProvider from "../../domains/SecretsProvider";
import { generateRandomId } from "../../utils";

export default class AccountManager {
    private readonly accounts: Map<string, Account>;
    private activeAccount: Account | null;

    constructor(
        accounts: Map<string, Account> = new Map(),
        activeAccount: Account | null = null,
    ) {
        this.accounts = accounts;
        this.activeAccount =
            activeAccount ?? accounts.values().next().value ?? null;
    }

    public async create(
        payload: TCreateAccountPayload,
        secretProvider: SecretsProvider,
    ): Promise<Account> {
        const account = await Account.create(payload, secretProvider);

        const id = generateRandomId();

        this.accounts.set(id, account);

        if (!this.activeAccount) {
            this.activeAccount = account;
        }

        return account;
    }

    public remove(id: string): boolean {
        const account: Account | undefined = this.accounts.get(id);

        if (!account) {
            return false;
        }

        const deleted: boolean = this.accounts.delete(id);

        if (this.activeAccount === account && !this.accounts.size) {
            return deleted;
        }

        this.activeAccount = this.accounts.values().next().value!;

        return deleted;
    }

    public update(id: string, payload: TEditableAccountOptions): void {
        const account: Account | undefined = this.accounts.get(id);

        if (!account) {
            console.error("Cannot update missing account");

            return;
        }

        account.update(payload);
    }

    public setActiveAccount(id: string): void {
        const account: Account | undefined = this.accounts.get(id);

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
        return Array.from(this.accounts.values());
    }

    public getAccountsMap(): Map<string, Account> {
        return this.accounts;
    }

    public getAccount(id: string): Account | null {
        return this.accounts.get(id) ?? null;
    }
}
