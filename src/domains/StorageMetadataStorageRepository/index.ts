import { ITableRecord } from "@domains/TableService";
import { IStorageFabricOptions } from "@fabrics/storage";
import { BaseStorageRepository } from "@domains/BaseStorageRepository";

const STORAGE_METADATA_DATA_KEY: string = "STORAGE_METADATA";
const STORAGE_SCHEMA_RECORD_ID: string = "schema";

export interface IStorageMetadataRecord extends ITableRecord {
    version: number;

    createdAt: number;
    updatedAt?: number;
}

export class StorageMetadataStorageRepository extends BaseStorageRepository<IStorageMetadataRecord> {
    private static instance: StorageMetadataStorageRepository;

    public constructor(options?: IStorageFabricOptions) {
        super(STORAGE_METADATA_DATA_KEY, options);
    }

    public static getInstance(
        options?: IStorageFabricOptions,
    ): StorageMetadataStorageRepository {
        if (!StorageMetadataStorageRepository.instance) {
            StorageMetadataStorageRepository.instance =
                new StorageMetadataStorageRepository(options);
        }
        return StorageMetadataStorageRepository.instance;
    }

    public async getVersion(): Promise<number | null> {
        const record: IStorageMetadataRecord | null = await this.getRecordById(
            STORAGE_SCHEMA_RECORD_ID,
        );

        if (!record) {
            return null;
        }

        return record.version;
    }

    public async saveVersion(version: number): Promise<void> {
        const record: IStorageMetadataRecord | null = await this.getRecordById(
            STORAGE_SCHEMA_RECORD_ID,
        );

        if (record) {
            await this.updateRecord(STORAGE_SCHEMA_RECORD_ID, { version });

            return;
        }

        await this.insertRecord({
            id: STORAGE_SCHEMA_RECORD_ID,
            version,
            createdAt: Date.now(),
        });
    }
}

export { STORAGE_METADATA_DATA_KEY, STORAGE_SCHEMA_RECORD_ID };