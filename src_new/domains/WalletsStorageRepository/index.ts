import { ITableRecord, ITableService } from "@domains/TableService";
import { storageFabric } from "@fabrics/Storage";
import { EncryptedData } from "@services/Crypto";

const STORE_KEY: string = "SDK_STORE";
const WALLETS_DATA_KEY: string = "WALLETS";

export enum WalletTypes {
    PRIVATE_KEY = "private-key",
    HD = "hd",
    MPC = "mpc",
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

export class WalletsStorageRepository {
    private static instance: WalletsStorageRepository;
    private db: ITableService<ITableRecord>;
    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    private constructor() {
        this.db = storageFabric();
    }

    public static getInstance(): WalletsStorageRepository {
        if (!WalletsStorageRepository.instance) {
            WalletsStorageRepository.instance = new WalletsStorageRepository();
        }
        return WalletsStorageRepository.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.log("Storage already initialized");
            return;
        }

        if (this.initPromise) {
            console.log("Storage initialization in progress, waiting...");
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
        console.log("Initializing Storage controller...");

        try {
            const asiStoreExists = await this.db.tableExists(STORE_KEY);

            if (!asiStoreExists) {
                console.log(`Creating main table: ${STORE_KEY}`);
                await this.db.createTable(STORE_KEY, "id");
            } else {
                console.log(`Main table ${STORE_KEY} already exists`);
            }

            const walletsTableExists =
                await this.db.tableExists(WALLETS_DATA_KEY);

            if (!walletsTableExists) {
                console.log(`Creating wallets table: ${WALLETS_DATA_KEY}`);
                await this.db.createTable(WALLETS_DATA_KEY, "id");
            } else {
                console.log(`Wallets table ${WALLETS_DATA_KEY} already exists`);
            }

            this.isInitialized = true;
            console.log("Storage controller initialized successfully");
            console.log(`Active tables: ${STORE_KEY}, ${WALLETS_DATA_KEY}`);
        } catch (error) {
            console.error("Failed to initialize Storage controller:", error);
            throw error;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    public getRawDB(): ITableService<ITableRecord> {
        return this.db;
    }

    public async setToSDKStore<T = any>(key: string, value: T): Promise<void> {
        await this.ensureInitialized();
        await this.db.insert(STORE_KEY, {
            id: key,
            value: value,
            createdAt: Date.now(),
        });
    }

    public async getFromSDKStore<T = any>(key: string): Promise<T | null> {
        await this.ensureInitialized();
        const record = await this.db.getById(STORE_KEY, key);
        return record?.value || null;
    }

    public async deleteFromSDKStore(key: string): Promise<void> {
        await this.ensureInitialized();
        await this.db.delete(STORE_KEY, key);
    }

    public async getAllFromSDKStore(): Promise<any[]> {
        await this.ensureInitialized();
        const records = await this.db.getAll(STORE_KEY);
        return records.map((record) => ({
            key: record.id,
            value: record.value,
        }));
    }

    public async saveWallet(
        walletId: string,
        name: string,
        type: WalletTypes,
        encryptedData: EncryptedData,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.db.insert(WALLETS_DATA_KEY, {
            id: walletId,
            name,
            type,
            encryptedData,
            createdAt: Date.now(),
        });
    }

    public async getWallet(id: string): Promise<IFullWalletRecord | null> {
        await this.ensureInitialized();
        return this.db.getById(
            WALLETS_DATA_KEY,
            id,
        ) as Promise<IFullWalletRecord | null>;
    }

    public async getAllWallets(): Promise<IFullWalletRecord[]> {
        await this.ensureInitialized();
        return this.db.getAll(WALLETS_DATA_KEY) as Promise<IFullWalletRecord[]>;
    }

    public async updateWallet(
        address: string,
        updates: Partial<IFullWalletRecord>,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.db.update(WALLETS_DATA_KEY, address, updates);
    }

    public async deleteWallet(address: string): Promise<void> {
        await this.ensureInitialized();
        await this.db.delete(WALLETS_DATA_KEY, address);
    }

    public async deleteMultipleWallets(addresses: string[]): Promise<void> {
        await this.ensureInitialized();
        await this.db.deleteMany(WALLETS_DATA_KEY, addresses);
    }

    public async hasWallet(address: string): Promise<boolean> {
        await this.ensureInitialized();
        const wallet = await this.getWallet(address);
        return wallet !== null;
    }

    public async getWalletsCount(): Promise<number> {
        await this.ensureInitialized();
        const wallets = await this.getAllWallets();
        return wallets.length;
    }

    public async clearAllData(): Promise<void> {
        await this.ensureInitialized();

        console.log("Clearing all data from Storage...");

        await this.db.clearTable(STORE_KEY);
        await this.db.clearTable(WALLETS_DATA_KEY);

        console.log("All data cleared successfully");
    }

    public async clearTable(tableName: string): Promise<void> {
        await this.ensureInitialized();

        if (![STORE_KEY, WALLETS_DATA_KEY].includes(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }

        await this.db.clearTable(tableName);
        console.log(`Table ${tableName} cleared`);
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public async getTablesList(): Promise<string[]> {
        await this.ensureInitialized();
        return [STORE_KEY, WALLETS_DATA_KEY];
    }

    public close(): void {
        this.db.close();
        this.isInitialized = false;
        console.log("Storage connection closed");
    }
}

export { STORE_KEY, WALLETS_DATA_KEY };
