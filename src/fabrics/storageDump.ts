import { ITableRecord } from "@domains/TableService";
import { IStorageMetadataRecord } from "@domains/StorageMetadataStorageRepository";
import type {
    IPersistedStorageDump,
    IPersistedStorageInterruptedMigration,
} from "@services/PersistedStorageTransfer";
import {
    BASELINE_STORAGE_VERSION,
    PERSISTED_STORAGE_DUMP_TYPE,
    PERSISTED_STORAGE_DUMP_VERSION,
} from "@config/index";

export interface ICreatePersistedStorageDumpPayload {
    schemaRecord: IStorageMetadataRecord | null;
    tables: Record<string, ITableRecord[]>;
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

export const createPersistedStorageDump = ({
    schemaRecord,
    tables,
}: ICreatePersistedStorageDumpPayload): IPersistedStorageDump => ({
    type: PERSISTED_STORAGE_DUMP_TYPE,
    version: PERSISTED_STORAGE_DUMP_VERSION,
    schemaVersion: schemaRecord?.version ?? BASELINE_STORAGE_VERSION,
    interruptedMigration: resolveInterruptedMigration(schemaRecord),
    createdAt: new Date().toISOString(),
    tables,
});
