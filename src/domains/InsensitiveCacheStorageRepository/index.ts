import { ITableRecord } from "@domains/TableService";
import { BaseStorageRepository } from "@domains/BaseStorageRepository";

const INSENSITIVE_CACHE_TABLE_KEY = "INSENSITIVE_CACHE";

export interface IInsensitiveCacheRecord extends ITableRecord {
    address: string;
}

export class InsensitiveCacheStorageRepository extends BaseStorageRepository<IInsensitiveCacheRecord> {
    private static instance: InsensitiveCacheStorageRepository;

    public constructor() {
        super(INSENSITIVE_CACHE_TABLE_KEY);
    }

    public static getInstance(): InsensitiveCacheStorageRepository {
        if (!InsensitiveCacheStorageRepository.instance) {
            InsensitiveCacheStorageRepository.instance =
                new InsensitiveCacheStorageRepository();
        }

        return InsensitiveCacheStorageRepository.instance;
    }

    public async saveRecord(record: IInsensitiveCacheRecord): Promise<void> {
        await this.insertRecord(record);
    }

    public async getRecord(
        id: string,
    ): Promise<IInsensitiveCacheRecord | null> {
        return this.getRecordById(id);
    }

    public async getAllRecords(): Promise<IInsensitiveCacheRecord[]> {
        return super.getAllRecords();
    }

    public async updateRecord(
        id: string,
        updates: Partial<IInsensitiveCacheRecord>,
    ): Promise<void> {
        await super.updateRecord(id, updates);
    }

    public async deleteRecord(id: string): Promise<void> {
        await super.deleteRecord(id);
    }

    public async clear(): Promise<void> {
        await this.clearAllData();
    }
}

export { INSENSITIVE_CACHE_TABLE_KEY };