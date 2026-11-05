import { ITableRecord, ITableService } from "@domains/TableService";
import {
    STORAGE_METADATA_DATA_KEY,
    StorageMetadataStorageRepository,
} from "@domains/StorageMetadataStorageRepository";
import {
    PersistedStorageImportError,
    PersistedStorageImportRejectedError,
    PersistedStorageImportRejection,
    UnknownErrorReason,
} from "@domains/CustomError";
import { IStorageFabricOptions, storageFabric } from "@fabrics/storage";
import { IPersistedStorageDump } from "@services/ExportPersistedStorageService";
import { PERSISTED_STORAGE_TABLES } from "@services/StorageBootstrap";
import {
    getErrorMessage,
    TPersistedStorageDumpValidation,
    validatePersistedStorageDump,
} from "@utils/index";

export default class ImportPersistedStorageService {
    public static fromJSON(source: string): unknown {
        try {
            return JSON.parse(source);
        } catch {
            throw new PersistedStorageImportRejectedError(
                PersistedStorageImportRejection.INVALID_FORMAT,
                "Dump is not a valid JSON",
            );
        }
    }

    public static parsePersistedStorageDump(
        source: unknown,
    ): IPersistedStorageDump {
        const dumpSource: unknown =
            typeof source === "string"
                ? ImportPersistedStorageService.fromJSON(source)
                : source;

        const validation: TPersistedStorageDumpValidation =
            validatePersistedStorageDump(dumpSource, PERSISTED_STORAGE_TABLES);

        if (!validation.isValid) {
            throw new PersistedStorageImportRejectedError(
                validation.rejection,
                validation.error,
            );
        }

        return dumpSource as IPersistedStorageDump;
    }

    private static async assertStorageIsEmpty(
        storage: ITableService<ITableRecord>,
    ): Promise<void> {
        for (const tableName of await storage.getTableNames()) {
            if (
                tableName !== STORAGE_METADATA_DATA_KEY &&
                (await storage.getAll(tableName)).length
            ) {
                throw new PersistedStorageImportRejectedError(
                    PersistedStorageImportRejection.STORAGE_NOT_EMPTY,
                    `Table ${tableName} already holds records`,
                );
            }
        }
    }

    private static async writeTables(
        storage: ITableService<ITableRecord>,
        tables: Record<string, ITableRecord[]>,
    ): Promise<void> {
        for (const [tableName, records] of Object.entries(tables)) {
            if (!(await storage.tableExists(tableName))) {
                await storage.createTable(tableName, "id");
            }

            await storage.insertMany(tableName, records);
        }
    }

    private static async clearTables(
        storage: ITableService<ITableRecord>,
        tableNames: string[],
    ): Promise<string[]> {
        const failures: string[] = [];

        for (const tableName of tableNames) {
            try {
                if (await storage.tableExists(tableName)) {
                    await storage.clearTable(tableName);
                }
            } catch (error: unknown) {
                failures.push(
                    `clearing ${tableName}: ${getErrorMessage(
                        error,
                        UnknownErrorReason.STORAGE,
                    )}`,
                );
            }
        }

        return failures;
    }

    private static async runImportStep(
        step: () => Promise<void>,
        rollback: () => Promise<string[]>,
    ): Promise<void> {
        try {
            await step();
        } catch (error: unknown) {
            if (error instanceof PersistedStorageImportRejectedError) {
                throw error;
            }

            throw new PersistedStorageImportError(
                getErrorMessage(error, UnknownErrorReason.STORAGE),
                error,
                await rollback(),
            );
        }
    }

    public static async importPersistedStorage(
        source: unknown,
        options?: IStorageFabricOptions,
    ): Promise<void> {
        const dump: IPersistedStorageDump =
            ImportPersistedStorageService.parsePersistedStorageDump(source);

        const storage: ITableService<ITableRecord> = storageFabric(options);

        await ImportPersistedStorageService.runImportStep(
            async () => {
                await storage.init();

                await ImportPersistedStorageService.assertStorageIsEmpty(
                    storage,
                );
            },
            async () => [],
        );

        await ImportPersistedStorageService.runImportStep(
            async () => {
                await ImportPersistedStorageService.writeTables(
                    storage,
                    dump.tables,
                );

                await StorageMetadataStorageRepository.getInstance(
                    options,
                ).restoreVersion(dump.schemaVersion);
            },
            () =>
                ImportPersistedStorageService.clearTables(
                    storage,
                    Object.keys(dump.tables),
                ),
        );
    }
}
