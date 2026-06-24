import { ITableRecord, ITableService } from "@domains/TableService";
import { storageFabric } from "@fabrics/Storage";

const INSENSITIVE_CACHE_TABLE_KEY = "INSENSITIVE_CACHE";

export interface IInsensitiveCacheRecord extends ITableRecord {
    address: string;
    HDPath: string | null;
}

export class InsensitiveCacheStorageRepository {
    private static instance: InsensitiveCacheStorageRepository;

    private storageInterface: ITableService<ITableRecord>;

    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    private constructor() {
        this.storageInterface = storageFabric();
    }

    public static getInstance(): InsensitiveCacheStorageRepository {
        if (!InsensitiveCacheStorageRepository.instance) {
            InsensitiveCacheStorageRepository.instance =
                new InsensitiveCacheStorageRepository();
        }

        return InsensitiveCacheStorageRepository.instance;
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
        const tableExists = await this.storageInterface.tableExists(
            INSENSITIVE_CACHE_TABLE_KEY,
        );

        if (!tableExists) {
            await this.storageInterface.createTable(
                INSENSITIVE_CACHE_TABLE_KEY,
                "id",
            );
        }

        this.isInitialized = true;
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    public async saveRecord(record: IInsensitiveCacheRecord): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.insert(INSENSITIVE_CACHE_TABLE_KEY, record);
    }

    public async getRecord(
        id: string,
    ): Promise<IInsensitiveCacheRecord | null> {
        await this.ensureInitialized();

        return this.storageInterface.getById(
            INSENSITIVE_CACHE_TABLE_KEY,
            id,
        ) as Promise<IInsensitiveCacheRecord | null>;
    }

    public async getAllRecords(): Promise<IInsensitiveCacheRecord[]> {
        await this.ensureInitialized();

        return this.storageInterface.getAll(
            INSENSITIVE_CACHE_TABLE_KEY,
        ) as Promise<IInsensitiveCacheRecord[]>;
    }

    public async updateRecord(
        id: string,
        updates: Partial<IInsensitiveCacheRecord>,
    ): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.update(
            INSENSITIVE_CACHE_TABLE_KEY,
            id,
            updates,
        );
    }

    public async deleteRecord(id: string): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.delete(INSENSITIVE_CACHE_TABLE_KEY, id);
    }

    public async clear(): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.clearTable(INSENSITIVE_CACHE_TABLE_KEY);
    }

    public close(): void {
        this.storageInterface.close();
        this.isInitialized = false;
    }
}

export { INSENSITIVE_CACHE_TABLE_KEY };
