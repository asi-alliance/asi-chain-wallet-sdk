import { ITableRecord, ITableService } from "@domains/TableService";
import { IStorageFabricOptions, storageFabric } from "@utils/fabrics/storage";

export abstract class BaseStorageRepository<T extends ITableRecord> {
    protected readonly tableName: string;
    protected storageInterface: ITableService<ITableRecord>;
    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    protected constructor(tableName: string, options?: IStorageFabricOptions) {
        this.tableName = tableName;
        this.storageInterface = storageFabric(options);
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
            this.tableName,
        );

        if (!tableExists) {
            await this.storageInterface.createTable(this.tableName, "id");
        }

        this.isInitialized = true;
    }

    protected async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    public getRawDB(): ITableService<ITableRecord> {
        return this.storageInterface;
    }

    protected async insertRecord(record: T): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.insert(this.tableName, record);
    }

    protected async insertManyRecords(records: T[]): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.insertMany(this.tableName, records);
    }

    protected async getRecordById(id: string): Promise<T | null> {
        await this.ensureInitialized();

        return this.storageInterface.getById(
            this.tableName,
            id,
        ) as Promise<T | null>;
    }

    protected async getAllRecords(): Promise<T[]> {
        await this.ensureInitialized();

        return this.storageInterface.getAll(this.tableName) as Promise<T[]>;
    }

    protected async updateRecord(
        id: string,
        updates: Partial<T>,
    ): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.update(this.tableName, id, updates);
    }

    protected async deleteRecord(id: string): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.delete(this.tableName, id);
    }

    protected async deleteManyRecords(ids: string[]): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.deleteMany(this.tableName, ids);
    }

    protected async hasRecord(id: string): Promise<boolean> {
        await this.ensureInitialized();

        const record = await this.getRecordById(id);

        return record !== null;
    }

    protected async getRecordsCount(): Promise<number> {
        await this.ensureInitialized();

        const records = await this.getAllRecords();

        return records.length;
    }

    public async clearAllData(): Promise<void> {
        await this.ensureInitialized();

        await this.storageInterface.clearTable(this.tableName);
    }

    public async clearTable(tableName: string): Promise<void> {
        await this.ensureInitialized();

        if (tableName !== this.tableName) {
            throw new Error(`Invalid table name: ${tableName}`);
        }

        await this.storageInterface.clearTable(tableName);
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public async getTablesList(): Promise<string[]> {
        await this.ensureInitialized();

        return [this.tableName];
    }

    public close(): void {
        this.storageInterface.close();
        this.isInitialized = false;
    }
}
