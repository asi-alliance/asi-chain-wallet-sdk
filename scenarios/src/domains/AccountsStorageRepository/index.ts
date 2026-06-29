import { storageFabric } from "../../fabrics/Storage";
import { EncryptedData } from "../../services/Crypto";
import { ITableRecord, ITableService } from "../TableService";

const STORE_KEY: string = "SDK_STORE";
const WALLETS_DATA_KEY: string = "WALLETS";

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

export interface IAccountRecord extends ITableRecord {
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

    private constructor() {
        this.storageInterface = storageFabric();
    }

    public static getInstance(): AccountsStorageRepository {
        if (!AccountsStorageRepository.instance) {
            AccountsStorageRepository.instance =
                new AccountsStorageRepository();
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
            const asiStoreExists =
                await this.storageInterface.tableExists(STORE_KEY);

            if (!asiStoreExists) {
                await this.storageInterface.createTable(STORE_KEY, "id");
            }

            const walletsTableExists =
                await this.storageInterface.tableExists(WALLETS_DATA_KEY);

            if (!walletsTableExists) {
                await this.storageInterface.createTable(WALLETS_DATA_KEY, "id");
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

    public async setToSDKStore<T = any>(key: string, value: T): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.insert(STORE_KEY, {
            id: key,
            value: value,
            createdAt: Date.now(),
        });
    }

    public async getFromSDKStore<T = any>(key: string): Promise<T | null> {
        await this.ensureInitialized();
        const record = await this.storageInterface.getById(STORE_KEY, key);
        return record?.value || null;
    }

    public async deleteFromSDKStore(key: string): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.delete(STORE_KEY, key);
    }

    public async getAllFromSDKStore(): Promise<any[]> {
        await this.ensureInitialized();
        const records = await this.storageInterface.getAll(STORE_KEY);
        return records.map((record) => ({
            key: record.id,
            value: record.value,
        }));
    }
    public async saveAccount(
        accountId: string,
        signerId: string,
        name: string,
        index: number | null,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.insert(WALLETS_DATA_KEY, {
            id: accountId,
            signerId,
            name,
            index,
            createdAt: Date.now(),
        });
    }

    public async getAccount(id: string): Promise<IAccountRecord | null> {
        await this.ensureInitialized();
        return this.storageInterface.getById(
            WALLETS_DATA_KEY,
            id,
        ) as Promise<IAccountRecord | null>;
    }

    public async getAllAccounts(): Promise<IAccountRecord[]> {
        await this.ensureInitialized();
        return this.storageInterface.getAll(WALLETS_DATA_KEY) as Promise<
            IAccountRecord[]
        >;
    }

    public async updateAccount(
        accountId: string,
        updates: Partial<IAccountRecord>,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.update(
            WALLETS_DATA_KEY,
            accountId,
            updates,
        );
    }

    public async deleteAccount(accountId: string): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.delete(WALLETS_DATA_KEY, accountId);
    }

    public async deleteMultipleAccounts(accountIds: string[]): Promise<void> {
        await this.ensureInitialized();
        await this.storageInterface.deleteMany(WALLETS_DATA_KEY, accountIds);
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

        await this.storageInterface.clearTable(STORE_KEY);
        await this.storageInterface.clearTable(WALLETS_DATA_KEY);
    }

    public async clearTable(tableName: string): Promise<void> {
        await this.ensureInitialized();

        if (![STORE_KEY, WALLETS_DATA_KEY].includes(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }

        await this.storageInterface.clearTable(tableName);
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public async getTablesList(): Promise<string[]> {
        await this.ensureInitialized();
        return [STORE_KEY, WALLETS_DATA_KEY];
    }

    public close(): void {
        this.storageInterface.close();
        this.isInitialized = false;
    }
}

export { STORE_KEY, WALLETS_DATA_KEY };
