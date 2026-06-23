import { Account } from "../domains/Account";
import { AccountService } from "./AccountService";
import { SessionService } from "./SessionService";

export class WalletService {
    constructor(
        private readonly accountService: AccountService,
        private readonly sessionService: SessionService,
    ) {}

    public async createAccount(accountProps: {
        id: string;
        address: string;
        signerId: string;
        networkId: string;
        metadata?: Record<string, unknown>;
    }): Promise<Account> {
        return this.accountService.createAccount(accountProps);
    }

    public async listAccounts(): Promise<Account[]> {
        return this.accountService.listAccounts();
    }

    public async switchActiveAccount(accountId: string): Promise<void> {
        await this.sessionService.setActiveAccount(accountId);
    }

    public async getActiveAccount(): Promise<Account | null> {
        return this.sessionService.getSession().then((session) =>
            session.activeAccountId
                ? this.accountService.getAccount(session.activeAccountId)
                : Promise.resolve(null),
        );
    }
}
