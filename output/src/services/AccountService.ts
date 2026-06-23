import { Account, AccountProps } from "../domains/Account";
import { AccountRecord } from "../modules/StorageAdapter";
import { StorageService } from "./StorageService";

export class AccountService {
    constructor(private readonly storage: StorageService) {}

    public async createAccount(props: AccountProps): Promise<Account> {
        const account = Account.create(props);

        const record: AccountRecord = {
            id: account.id,
            address: account.address,
            signerId: account.signerId,
            networkId: account.networkId,
            metadata: account.metadata,
            createdAt: Date.now(),
        };

        await this.storage.saveAccount(record);
        return account;
    }

    public async getAccount(id: string): Promise<Account | null> {
        const record = await this.storage.getAccount(id);
        if (!record) {
            return null;
        }

        return Account.create({
            id: record.id,
            address: record.address,
            signerId: record.signerId,
            networkId: record.networkId,
            metadata: record.metadata,
        });
    }

    public async listAccounts(): Promise<Account[]> {
        const records = await this.storage.getAllAccounts();
        return records.map((record) =>
            Account.create({
                id: record.id,
                address: record.address,
                signerId: record.signerId,
                networkId: record.networkId,
                metadata: record.metadata,
            }),
        );
    }

    public async listAccountsBySigner(signerId: string): Promise<Account[]> {
        const records = await this.storage.getAccountsBySigner(signerId);
        return records.map((record) =>
            Account.create({
                id: record.id,
                address: record.address,
                signerId: record.signerId,
                networkId: record.networkId,
                metadata: record.metadata,
            }),
        );
    }

    public async deleteAccount(id: string): Promise<void> {
        await this.storage.deleteAccount(id);
    }
}
