import EncryptedRecord from "@domains/EncryptedRecord";
import IndexedDBTableStore from "@domains/IDBStorage";
import { ITableRecord } from "@domains/IDBStorage/meta";
import { EncryptedData } from "@services/Crypto";

const STORE_KEY: string = "ASI_STORE";
const SEEDS_DATA_KEY: string = "SEEDS";
const PK_WALLETS_DATA_KEY: string = "PK-WALLETS";

export interface ISeedRecord extends ITableRecord {
    id: string;
    encryptedData: string;

    createdAt: number;
    updatedAt?: number;
}

export interface IPKWalletRecord extends ITableRecord {
    id: string;
    encryptedPrivateKey: string;
    publicKey?: string;
    network?: string;
    createdAt: number;
    updatedAt?: number;
}

export class IDBStorageController {
    private static instance: IDBStorageController;
    private db: IndexedDBTableStore;
    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    private constructor() {
        this.db = new IndexedDBTableStore("CryptoAppDatabase", 1);
    }

    public static getInstance(): IDBStorageController {
        if (!IDBStorageController.instance) {
            IDBStorageController.instance = new IDBStorageController();
        }
        return IDBStorageController.instance;
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
        console.log("Initializing storage controller...");

        try {
            const asiStoreExists = await this.db.tableExists(STORE_KEY);

            if (!asiStoreExists) {
                console.log(`Creating main table: ${STORE_KEY}`);
                await this.db.createTable(STORE_KEY, "id");
            } else {
                console.log(`Main table ${STORE_KEY} already exists`);
            }

            const seedsTableExists = await this.db.tableExists(SEEDS_DATA_KEY);

            if (!seedsTableExists) {
                console.log(`Creating seeds table: ${SEEDS_DATA_KEY}`);
                await this.db.createTable(SEEDS_DATA_KEY, "id");
            } else {
                console.log(`Seeds table ${SEEDS_DATA_KEY} already exists`);
            }

            const pkWalletsTableExists =
                await this.db.tableExists(PK_WALLETS_DATA_KEY);

            if (!pkWalletsTableExists) {
                console.log(
                    `Creating PK wallets table: ${PK_WALLETS_DATA_KEY}`,
                );
                await this.db.createTable(PK_WALLETS_DATA_KEY, "id");
            } else {
                console.log(
                    `PK wallets table ${PK_WALLETS_DATA_KEY} already exists`,
                );
            }

            this.isInitialized = true;
            console.log("Storage controller initialized successfully");
            console.log(
                `Active tables: ${STORE_KEY}, ${SEEDS_DATA_KEY}, ${PK_WALLETS_DATA_KEY}`,
            );
        } catch (error) {
            console.error("Failed to initialize storage controller:", error);
            throw error;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    public getRawDB(): IndexedDBTableStore {
        return this.db;
    }

    public async setToASIStore<T = any>(key: string, value: T): Promise<void> {
        await this.ensureInitialized();
        await this.db.insert(STORE_KEY, {
            id: key,
            value: value,
            createdAt: Date.now(),
        });
    }

    public async getFromASIStore<T = any>(key: string): Promise<T | null> {
        await this.ensureInitialized();
        const record = await this.db.getById(STORE_KEY, key);
        return record?.value || null;
    }

    public async deleteFromASIStore(key: string): Promise<void> {
        await this.ensureInitialized();
        await this.db.delete(STORE_KEY, key);
    }

    public async getAllFromASIStore(): Promise<any[]> {
        await this.ensureInitialized();
        const records = await this.db.getAll(STORE_KEY);
        return records.map((record) => ({
            key: record.id,
            value: record.value,
        }));
    }

    public async saveSeed(
        seedId: string,
        encryptedData: EncryptedData,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.db.insert(SEEDS_DATA_KEY, {
            id: seedId,
            ...encryptedData,
            createdAt: Date.now(),
        });
    }

    public async getSeed(seedId: string): Promise<ISeedRecord | null> {
        await this.ensureInitialized();
        return this.db.getById(
            SEEDS_DATA_KEY,
            seedId,
        ) as Promise<ISeedRecord | null>;
    }

    public async getAllSeeds(): Promise<ISeedRecord[]> {
        await this.ensureInitialized();
        return this.db.getAll(SEEDS_DATA_KEY) as Promise<ISeedRecord[]>;
    }

    public async updateSeed(
        seedId: string,
        encryptedPhrase: string,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.db.update(SEEDS_DATA_KEY, seedId, {
            encryptedPhrase: encryptedPhrase,
        });
    }

    public async deleteSeed(seedId: string): Promise<void> {
        await this.ensureInitialized();
        await this.db.delete(SEEDS_DATA_KEY, seedId);
    }

    public async hasSeed(seedId: string): Promise<boolean> {
        await this.ensureInitialized();
        const seed = await this.getSeed(seedId);
        return seed !== null;
    }

    public async savePKWallet(
        address: string,
        encryptedPrivateKey: string,
        publicKey?: string,
        network?: string,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.db.insert(PK_WALLETS_DATA_KEY, {
            id: address,
            encryptedPrivateKey: encryptedPrivateKey,
            publicKey: publicKey,
            network: network || "ethereum",
            createdAt: Date.now(),
        });
    }

    public async getPKWallet(address: string): Promise<IPKWalletRecord | null> {
        await this.ensureInitialized();
        return this.db.getById(
            PK_WALLETS_DATA_KEY,
            address,
        ) as Promise<IPKWalletRecord | null>;
    }

    public async getAllPKWallets(): Promise<IPKWalletRecord[]> {
        await this.ensureInitialized();
        return this.db.getAll(PK_WALLETS_DATA_KEY) as Promise<
            IPKWalletRecord[]
        >;
    }

    public async updatePKWallet(
        address: string,
        updates: Partial<IPKWalletRecord>,
    ): Promise<void> {
        await this.ensureInitialized();
        await this.db.update(PK_WALLETS_DATA_KEY, address, updates);
    }

    public async deletePKWallet(address: string): Promise<void> {
        await this.ensureInitialized();
        await this.db.delete(PK_WALLETS_DATA_KEY, address);
    }

    public async deleteMultiplePKWallets(addresses: string[]): Promise<void> {
        await this.ensureInitialized();
        await this.db.deleteMany(PK_WALLETS_DATA_KEY, addresses);
    }

    public async hasPKWallet(address: string): Promise<boolean> {
        await this.ensureInitialized();
        const wallet = await this.getPKWallet(address);
        return wallet !== null;
    }

    public async getPKWalletsCount(): Promise<number> {
        await this.ensureInitialized();
        const wallets = await this.getAllPKWallets();
        return wallets.length;
    }

    public async clearAllData(): Promise<void> {
        await this.ensureInitialized();

        console.log("Clearing all data from storage...");

        await this.db.clearTable(STORE_KEY);
        await this.db.clearTable(SEEDS_DATA_KEY);
        await this.db.clearTable(PK_WALLETS_DATA_KEY);

        console.log("All data cleared successfully");
    }

    public async clearTable(tableName: string): Promise<void> {
        await this.ensureInitialized();

        if (
            ![STORE_KEY, SEEDS_DATA_KEY, PK_WALLETS_DATA_KEY].includes(
                tableName,
            )
        ) {
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
        return [STORE_KEY, SEEDS_DATA_KEY, PK_WALLETS_DATA_KEY];
    }

    public close(): void {
        this.db.close();
        this.isInitialized = false;
        console.log("Storage connection closed");
    }
}

export { STORE_KEY, SEEDS_DATA_KEY, PK_WALLETS_DATA_KEY };
