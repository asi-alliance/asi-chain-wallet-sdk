import { ITableRecord, ITableService } from "@domains/TableService";
import {
    IStorageMetadataRecord,
    STORAGE_METADATA_DATA_KEY,
    STORAGE_SCHEMA_RECORD_ID,
} from "@domains/StorageMetadataStorageRepository";
import {
    PersistedStorageExportError,
    UnknownErrorReason,
} from "@domains/CustomError";
import { IStorageFabricOptions, storageFabric } from "@fabrics/storage";
import { createPersistedStorageDump } from "@fabrics/storageDump";
import { getErrorMessage } from "@utils/index";

export interface IPersistedStorageInterruptedMigration {
    pendingVersion: number;
    rollbackFailed: boolean;
}

export interface IPersistedStorageDump {
    type: string;
    version: number;
    schemaVersion: number;
    interruptedMigration: IPersistedStorageInterruptedMigration | null;
    createdAt: string;
    tables: Record<string, ITableRecord[]>;
}

export default class PersistedStorageTransfer {
    private static async readSchemaRecord(
        storage: ITableService<ITableRecord>,
        tableNames: string[],
    ): Promise<IStorageMetadataRecord | null> {
        if (!tableNames.includes(STORAGE_METADATA_DATA_KEY)) {
            return null;
        }

        return (await storage.getById(
            STORAGE_METADATA_DATA_KEY,
            STORAGE_SCHEMA_RECORD_ID,
        )) as IStorageMetadataRecord | null;
    }

    private static async readDataTables(
        storage: ITableService<ITableRecord>,
        tableNames: string[],
    ): Promise<Record<string, ITableRecord[]>> {
        const tables: Record<string, ITableRecord[]> = {};

        for (const tableName of tableNames) {
            if (tableName !== STORAGE_METADATA_DATA_KEY) {
                tables[tableName] = await storage.getAll(tableName);
            }
        }

        return tables;
    }

    private static async readDump(
        options?: IStorageFabricOptions,
    ): Promise<IPersistedStorageDump> {
        const storage: ITableService<ITableRecord> = storageFabric(options);

        await storage.init();

        const tableNames: string[] = await storage.getTableNames();

        return createPersistedStorageDump({
            schemaRecord: await PersistedStorageTransfer.readSchemaRecord(
                storage,
                tableNames,
            ),
            tables: await PersistedStorageTransfer.readDataTables(
                storage,
                tableNames,
            ),
        });
    }

    public static async export(
        options?: IStorageFabricOptions,
    ): Promise<IPersistedStorageDump> {
        try {
            return await PersistedStorageTransfer.readDump(options);
        } catch (error: unknown) {
            throw new PersistedStorageExportError(
                getErrorMessage(error, UnknownErrorReason.STORAGE),
                error,
            );
        }
    }
}
