import { IStorageMetadataRecord } from "@domains/StorageMetadataStorageRepository";
import SecretsProvider from "@domains/SecretsProvider";
import CryptoService from "@services/Crypto";
import type {
    IPersistedStorageDump,
    IPersistedStorageInterruptedMigration,
    TPersistedStorageTables,
} from "@services/ExportPersistedStorageService";
import {
    BASELINE_STORAGE_VERSION,
    PERSISTED_STORAGE_DUMP_TYPE,
    PERSISTED_STORAGE_DUMP_VERSION,
} from "@config/index";

export interface ICreatePersistedStorageDumpPayload {
    schemaRecord: IStorageMetadataRecord | null;
    tables: TPersistedStorageTables;
    passwordProvider: SecretsProvider;
}

const resolveInterruptedMigration = (
    schemaRecord: IStorageMetadataRecord | null,
): IPersistedStorageInterruptedMigration | null => {
    const pendingVersion: number | null = schemaRecord?.pendingVersion ?? null;

    if (pendingVersion === null) {
        return null;
    }

    return {
        pendingVersion,
        rollbackFailed: !!schemaRecord?.rollbackFailure,
    };
};

export const createPersistedStorageDump = async ({
    schemaRecord,
    tables,
    passwordProvider,
}: ICreatePersistedStorageDumpPayload): Promise<IPersistedStorageDump> => ({
    type: PERSISTED_STORAGE_DUMP_TYPE,
    version: PERSISTED_STORAGE_DUMP_VERSION,
    schemaVersion: schemaRecord?.version ?? BASELINE_STORAGE_VERSION,
    interruptedMigration: resolveInterruptedMigration(schemaRecord),
    createdAt: new Date().toISOString(),
    encryptedTables: await CryptoService.encryptWithPassword(
        JSON.stringify(tables),
        passwordProvider.getSecret().password,
    ),
});
