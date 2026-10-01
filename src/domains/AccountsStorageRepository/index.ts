import { IStorageFabricOptions } from "@fabrics/storage";
import { BaseStorageRepository } from "@domains/BaseStorageRepository";
import { ITableRecord } from "@domains/TableService";
import { EncryptedData } from "@services/Crypto";
import { WalletTypes } from "@domains/Signer";

const ACCOUNTS_DATA_KEY: string = "ACCOUNTS";

export interface IPublicWalletRecord extends ITableRecord {
    name: string;
    type: WalletTypes;
}

export interface IWalletRecordEncryptedFields {
    keyData: string;
    depth: number | null;
    HDPath: string | null;
}

export interface IFullWalletRecord extends IPublicWalletRecord, ITableRecord {
    encryptedData: EncryptedData;

    createdAt: number;
    updatedAt?: number;
}

export interface IAccountStorageRecord extends ITableRecord {
    signerId: string;
    name: string;
    index: number | null;
    fingerprint: string;

    createdAt: number;
    updatedAt?: number;
}

export class AccountsStorageRepository extends BaseStorageRepository<IAccountStorageRecord> {
    private static instance: AccountsStorageRepository;

    public constructor(options?: IStorageFabricOptions) {
        super(ACCOUNTS_DATA_KEY, options);
    }

    public static getInstance(
        options?: IStorageFabricOptions,
    ): AccountsStorageRepository {
        if (!AccountsStorageRepository.instance) {
            AccountsStorageRepository.instance = new AccountsStorageRepository(
                options,
            );
        }
        return AccountsStorageRepository.instance;
    }

    public async saveAccount(
        accountId: string,
        signerId: string,
        name: string,
        index: number | null,
        fingerprint: string,
    ): Promise<void> {
        await this.insertRecord({
            id: accountId,
            signerId,
            name,
            index,
            fingerprint,
            createdAt: Date.now(),
        });
    }

    public async saveAccounts(
        accounts: IAccountStorageRecord[],
    ): Promise<void> {
        await this.insertManyRecords(accounts);
    }

    public async getAccount(id: string): Promise<IAccountStorageRecord | null> {
        return this.getRecordById(id);
    }

    public async getAllAccounts(): Promise<IAccountStorageRecord[]> {
        return this.getAllRecords();
    }

    public async getAccountsBySignerId(
        signerId: string,
    ): Promise<IAccountStorageRecord[]> {
        return this.getByFilter(
            (accountRecord: IAccountStorageRecord) =>
                accountRecord.signerId === signerId,
        );
    }

    public async findAccountByFingerprint(
        fingerprint: string,
    ): Promise<IAccountStorageRecord | null> {
        const [record] = await this.getByFilter(
            (accountRecord: IAccountStorageRecord) =>
                accountRecord.fingerprint === fingerprint,
        );

        return record ?? null;
    }

    public async updateAccount(
        accountId: string,
        updates: Partial<IAccountStorageRecord>,
    ): Promise<void> {
        await this.updateRecord(accountId, updates);
    }

    public async deleteAccount(accountId: string): Promise<void> {
        await this.deleteRecord(accountId);
    }

    public async deleteMultipleAccounts(accountIds: string[]): Promise<void> {
        await this.deleteManyRecords(accountIds);
    }

    public async hasAccount(accountId: string): Promise<boolean> {
        return this.hasRecord(accountId);
    }

    public async getAccountsCount(): Promise<number> {
        return this.getRecordsCount();
    }
}

export { ACCOUNTS_DATA_KEY };
