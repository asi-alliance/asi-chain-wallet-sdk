import { ITableRecord, ITableService } from "@domains/TableService";
import {
    STORAGE_METADATA_DATA_KEY,
    StorageMetadataStorageRepository,
} from "@domains/StorageMetadataStorageRepository";
import {
    CorruptedDataError,
    InvalidPasswordError,
    PersistedStorageImportError,
    PersistedStorageImportRejectedError,
    PersistedStorageImportRejection,
    UnknownErrorReason,
    UnsupportedEncryptionVersionError,
} from "@domains/CustomError";
import SecretsProvider from "@domains/SecretsProvider";
import { IStorageFabricOptions, storageFabric } from "@fabrics/storage";
import CryptoService from "@services/Crypto";
import {
    IPersistedStorageDump,
    TPersistedStorageTables,
} from "@services/ExportPersistedStorageService";
import { PERSISTED_STORAGE_TABLES } from "@services/StorageBootstrap";
import SerialOperationQueue from "@services/SerialOperationQueue";
import {
    getErrorMessage,
    TPersistedStorageDumpValidation,
    validatePersistedStorageDump,
    validatePersistedStorageTables,
} from "@utils/index";

export default class ImportPersistedStorageService {
    private static readonly importQueue: SerialOperationQueue =
        new SerialOperationQueue();

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
            validatePersistedStorageDump(dumpSource);

        if (!validation.isValid) {
            throw new PersistedStorageImportRejectedError(
                validation.rejection,
                validation.error,
            );
        }

        return dumpSource as IPersistedStorageDump;
    }

    private static async decryptTablesSource(
        dump: IPersistedStorageDump,
        passwordProvider: SecretsProvider,
    ): Promise<string> {
        try {
            return await CryptoService.decryptWithPassword(
                dump.encryptedTables,
                passwordProvider.getSecret().password,
            );
        } catch (error: unknown) {
            if (error instanceof InvalidPasswordError) {
                throw new PersistedStorageImportRejectedError(
                    PersistedStorageImportRejection.INVALID_PASSWORD,
                    "The backup password does not match the dump",
                );
            }

            if (
                error instanceof CorruptedDataError ||
                error instanceof UnsupportedEncryptionVersionError
            ) {
                throw new PersistedStorageImportRejectedError(
                    PersistedStorageImportRejection.INVALID_FORMAT,
                    `Dump tables cannot be decrypted: ${error.message}`,
                );
            }

            throw new PersistedStorageImportError(
                getErrorMessage(error, UnknownErrorReason.CRYPTO),
                error,
                [],
            );
        }
    }

    public static async decryptPersistedStorageTables(
        dump: IPersistedStorageDump,
        passwordProvider: SecretsProvider,
    ): Promise<TPersistedStorageTables> {
        const tablesSource: unknown = ImportPersistedStorageService.fromJSON(
            await ImportPersistedStorageService.decryptTablesSource(
                dump,
                passwordProvider,
            ),
        );

        const validation: TPersistedStorageDumpValidation =
            validatePersistedStorageTables(
                tablesSource,
                PERSISTED_STORAGE_TABLES,
            );

        if (!validation.isValid) {
            throw new PersistedStorageImportRejectedError(
                validation.rejection,
                validation.error,
            );
        }

        return tablesSource as TPersistedStorageTables;
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
        tables: TPersistedStorageTables,
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
        passwordProvider: SecretsProvider,
        options?: IStorageFabricOptions,
    ): Promise<void> {
        const dump: IPersistedStorageDump =
            ImportPersistedStorageService.parsePersistedStorageDump(source);

        const tables: TPersistedStorageTables =
            await ImportPersistedStorageService.decryptPersistedStorageTables(
                dump,
                passwordProvider,
            );

        const storage: ITableService<ITableRecord> = storageFabric(options);

        await ImportPersistedStorageService.importQueue.run(async () => {
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
                        tables,
                    );

                    await StorageMetadataStorageRepository.getInstance(
                        options,
                    ).restoreVersion(dump.schemaVersion);
                },
                () =>
                    ImportPersistedStorageService.clearTables(
                        storage,
                        Object.keys(tables),
                    ),
            );
        });
    }
}
