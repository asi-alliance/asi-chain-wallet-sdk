import { ITableRecord } from "@domains/TableService";
import { IStorageFabricOptions } from "@fabrics/storage";
import { BaseStorageRepository } from "@domains/BaseStorageRepository";
import { BASELINE_STORAGE_VERSION } from "@config/index";

const STORAGE_METADATA_DATA_KEY: string = "STORAGE_METADATA";
const STORAGE_SCHEMA_RECORD_ID: string = "schema";

export interface IStorageMetadataRecord extends ITableRecord {
    version: number;
    pendingVersion?: number | null;
    rollbackFailure?: string | null;

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

    private async updateSchemaRecord(
        updates: Partial<IStorageMetadataRecord>,
    ): Promise<void> {
        const record: IStorageMetadataRecord | null = await this.getRecordById(
            STORAGE_SCHEMA_RECORD_ID,
        );

        if (record) {
            await this.updateRecord(STORAGE_SCHEMA_RECORD_ID, updates);

            return;
        }

        await this.insertRecord({
            id: STORAGE_SCHEMA_RECORD_ID,
            version: BASELINE_STORAGE_VERSION,
            pendingVersion: null,
            rollbackFailure: null,
            createdAt: Date.now(),
            ...updates,
        });
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
        await this.updateSchemaRecord({ version, pendingVersion: null });
    }

    public async getPendingVersion(): Promise<number | null> {
        const record: IStorageMetadataRecord | null = await this.getRecordById(
            STORAGE_SCHEMA_RECORD_ID,
        );

        if (!record) {
            return null;
        }

        return record.pendingVersion ?? null;
    }

    public async markPendingMigration(version: number): Promise<void> {
        await this.updateSchemaRecord({ pendingVersion: version });
    }

    public async clearPendingMigration(): Promise<void> {
        await this.updateSchemaRecord({ pendingVersion: null });
    }

    public async getRollbackFailure(): Promise<string | null> {
        const record: IStorageMetadataRecord | null = await this.getRecordById(
            STORAGE_SCHEMA_RECORD_ID,
        );

        if (!record) {
            return null;
        }

        return record.rollbackFailure ?? null;
    }

    public async markRollbackFailure(reason: string): Promise<void> {
        await this.updateSchemaRecord({ rollbackFailure: reason });
    }
}

export { STORAGE_METADATA_DATA_KEY, STORAGE_SCHEMA_RECORD_ID };