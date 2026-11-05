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
import SecretsProvider from "@domains/SecretsProvider";
import { IStorageFabricOptions, storageFabric } from "@fabrics/storage";
import { createPersistedStorageDump } from "@fabrics/storageDump";
import { EncryptedData } from "@services/Crypto";
import { getErrorMessage, isNonEmptyString } from "@utils/index";

export interface IPersistedStorageInterruptedMigration {
    pendingVersion: number;
    rollbackFailed: boolean;
}

export type TPersistedStorageTables = Record<string, ITableRecord[]>;

export interface IPersistedStorageDump {
    type: string;
    version: number;
    schemaVersion: number;
    interruptedMigration: IPersistedStorageInterruptedMigration | null;
    createdAt: string;
    encryptedTables: EncryptedData;
}

export default class ExportPersistedStorageService {
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
    ): Promise<TPersistedStorageTables> {
        const tables: TPersistedStorageTables = {};

        for (const tableName of tableNames) {
            if (tableName !== STORAGE_METADATA_DATA_KEY) {
                tables[tableName] = await storage.getAll(tableName);
            }
        }

        return tables;
    }

    private static async readDump(
        passwordProvider: SecretsProvider,
        options?: IStorageFabricOptions,
    ): Promise<IPersistedStorageDump> {
        const storage: ITableService<ITableRecord> = storageFabric(options);

        await storage.init();

        const tableNames: string[] = await storage.getTableNames();

        return createPersistedStorageDump({
            schemaRecord: await ExportPersistedStorageService.readSchemaRecord(
                storage,
                tableNames,
            ),
            tables: await ExportPersistedStorageService.readDataTables(
                storage,
                tableNames,
            ),
            passwordProvider,
        });
    }

    public static async exportPersistedStorage(
        passwordProvider: SecretsProvider,
        options?: IStorageFabricOptions,
    ): Promise<IPersistedStorageDump> {
        if (!isNonEmptyString(passwordProvider.getSecret().password)) {
            throw new PersistedStorageExportError(
                "the backup password is empty",
                null,
            );
        }

        try {
            return await ExportPersistedStorageService.readDump(
                passwordProvider,
                options,
            );
        } catch (error: unknown) {
            throw new PersistedStorageExportError(
                getErrorMessage(error, UnknownErrorReason.STORAGE),
                error,
            );
        }
    }
}
