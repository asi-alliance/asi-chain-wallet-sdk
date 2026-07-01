import { IStorageFabricOptions, storageFabric } from "../../fabrics/Storage";
import { EncryptedData } from "../../services/Crypto";
import { ITableRecord, ITableService } from "../TableService";

const ACCOUNTS_DATA_KEY: string = "ACCOUNTS";

export enum WalletTypes {
    PRIVATE_KEY = "private-key",
    HD = "hd",
}

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

    createdAt: number;
    updatedAt?: number;
}

export class AccountsStorageRepository {
    private static instance: AccountsStorageRepository;
    private storageInterface: ITableService<ITableRecord>;
    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    private constructor(options?: IStorageFabricOptions) {
        this.storageInterface = storageFabric(options);
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

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.doInitialize();

        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    }

    private async doInitialize(): Promise<void> {
        try {
            const walletsTableExists =
                await this.storageInterface.tableExists(ACCOUNTS_DATA_KEY);

            if (!walletsTableExists) {
                await this.storageInterface.createTable(
                    ACCOUNTS_DATA_KEY,
                    "id",
                );
            }

            this.isInitialized = true;
        } catch (error) {
            throw error;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    public getRawDB(): ITableService<ITableRecord> {
        return this.storageInterface;
    }

    public async saveAccount(
        accountId: string,
        signerId: string,
        name: string,
        index: number | null,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.insert(ACCOUNTS_DATA_KEY, {
            id: accountId,
            signerId,
            name,
            index,
            createdAt: Date.now(),
        });
    }

    public async saveAccounts(
        accounts: IAccountStorageRecord[],
    ): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.insertMany(ACCOUNTS_DATA_KEY, accounts);
    }

    public async getAccount(id: string): Promise<IAccountStorageRecord | null> {
        await this.ensureInitialized();
        return this.storageInterface.getById(
            ACCOUNTS_DATA_KEY,
            id,
        ) as Promise<IAccountStorageRecord | null>;
    }

    public async getAllAccounts(): Promise<IAccountStorageRecord[]> {
        await this.ensureInitialized();
        return this.storageInterface.getAll(ACCOUNTS_DATA_KEY) as Promise<
            IAccountStorageRecord[]
        >;
    }

    public async updateAccount(
        accountId: string,
        updates: Partial<IAccountStorageRecord>,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.update(
            ACCOUNTS_DATA_KEY,
            accountId,
            updates,
        );
    }

    public async deleteAccount(accountId: string): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.delete(ACCOUNTS_DATA_KEY, accountId);
    }

    public async deleteMultipleAccounts(accountIds: string[]): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.deleteMany(ACCOUNTS_DATA_KEY, accountIds);
    }

    public async hasAccount(accountId: string): Promise<boolean> {
        await this.ensureInitialized();
        const account = await this.getAccount(accountId);
        return account !== null;
    }

    public async getAccountsCount(): Promise<number> {
        await this.ensureInitialized();
        const accounts = await this.getAllAccounts();
        return accounts.length;
    }

    public async clearAllData(): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.clearTable(ACCOUNTS_DATA_KEY);
    }

    public async clearTable(tableName: string): Promise<void> {
        await this.ensureInitialized();

        if (![ACCOUNTS_DATA_KEY].includes(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }

        await this.storageInterface.clearTable(tableName);
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public async getTablesList(): Promise<string[]> {
        await this.ensureInitialized();
        return [ACCOUNTS_DATA_KEY];
    }

    public close(): void {
        this.storageInterface.close();
        this.isInitialized = false;
    }
}

export { ACCOUNTS_DATA_KEY };
