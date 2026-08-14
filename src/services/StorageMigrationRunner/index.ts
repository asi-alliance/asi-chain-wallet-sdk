import { ITableRecord, ITableService } from "@domains/TableService";
import { StorageMetadataStorageRepository } from "@domains/StorageMetadataStorageRepository";
import {
    StorageMigrationInterruptedError,
    StorageMigrationInterruptionReason,
    StorageVersionDowngradeError,
} from "@domains/CustomError";
import {
    BASELINE_STORAGE_VERSION,
    CURRENT_STORAGE_VERSION,
} from "@config/index";
import { STORAGE_MIGRATIONS } from "./migrations";

export interface IStorageMigration {
    version: number;
    description: string;
    resumable?: boolean;
    run(storage: ITableService<ITableRecord>): Promise<void>;
}

export interface IStorageMigrationRunnerOptions {
    storage: ITableService<ITableRecord>;
    metadataRepository: StorageMetadataStorageRepository;
    tables: string[];
    migrations?: IStorageMigration[];
    currentVersion?: number;
}

type TTableBackup = Record<string, ITableRecord[]>;

export default class StorageMigrationRunner {
    private readonly storage: ITableService<ITableRecord>;
    private readonly metadataRepository: StorageMetadataStorageRepository;
    private readonly tables: string[];
    private readonly migrations: IStorageMigration[];
    private readonly currentVersion: number;

    constructor({
        storage,
        metadataRepository,
        tables,
        migrations = STORAGE_MIGRATIONS,
        currentVersion = CURRENT_STORAGE_VERSION,
    }: IStorageMigrationRunnerOptions) {
        this.storage = storage;
        this.metadataRepository = metadataRepository;
        this.tables = tables;
        this.migrations = migrations;
        this.currentVersion = currentVersion;
    }

    private async resolveStoredVersion(): Promise<number> {
        const storedVersion: number | null =
            await this.metadataRepository.getVersion();

        return storedVersion ?? BASELINE_STORAGE_VERSION;
    }

    private getPendingMigrations(storedVersion: number): IStorageMigration[] {
        return this.migrations
            .filter(
                (migration: IStorageMigration) =>
                    migration.version > storedVersion,
            )
            .sort(
                (first: IStorageMigration, second: IStorageMigration) =>
                    first.version - second.version,
            );
    }

    private async createBackup(): Promise<TTableBackup> {
        const backup: TTableBackup = {};

        for (const tableName of this.tables) {
            if (await this.storage.tableExists(tableName)) {
                backup[tableName] = await this.storage.getAll(tableName);
            }
        }

        return backup;
    }

    private async restoreBackup(backup: TTableBackup): Promise<void> {
        for (const [tableName, records] of Object.entries(backup)) {
            await this.storage.clearTable(tableName);

            await this.storage.insertMany(tableName, records);
        }
    }

    private async revertMigration(backup: TTableBackup): Promise<void> {
        try {
            await this.restoreBackup(backup);
        } catch (rollbackError: unknown) {
            await this.metadataRepository.markRollbackFailure(
                rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError),
            );

            return;
        }

        await this.metadataRepository.clearPendingMigration();
    }

    private async applyMigration(migration: IStorageMigration): Promise<void> {
        const backup: TTableBackup = await this.createBackup();

        await this.metadataRepository.markPendingMigration(migration.version);

        try {
            await migration.run(this.storage);

            await this.metadataRepository.saveVersion(migration.version);
        } catch (error) {
            await this.revertMigration(backup);

            throw error;
        }
    }

    private async assertInterruptedMigrationIsResumable(): Promise<void> {
        const pendingVersion: number | null =
            await this.metadataRepository.getPendingVersion();

        if (pendingVersion === null) {
            return;
        }

        const rollbackFailure: string | null =
            await this.metadataRepository.getRollbackFailure();

        if (rollbackFailure) {
            throw new StorageMigrationInterruptedError(
                pendingVersion,
                StorageMigrationInterruptionReason.ROLLBACK_FAILED,
                `Migration to storage schema version ${pendingVersion} failed and its rollback did not complete: ${rollbackFailure}. Storage holds partially migrated data and must be restored from an export or re-imported`,
            );
        }

        const interruptedMigration: IStorageMigration | undefined =
            this.migrations.find(
                (migration: IStorageMigration) =>
                    migration.version === pendingVersion,
            );

        if (!interruptedMigration) {
            throw new StorageMigrationInterruptedError(
                pendingVersion,
                StorageMigrationInterruptionReason.MIGRATION_NOT_FOUND,
                `Storage was interrupted while migrating to schema version ${pendingVersion}, which this SDK build does not know. Storage state is unknown and cannot be resumed`,
            );
        }

        if (interruptedMigration.resumable === false) {
            throw new StorageMigrationInterruptedError(
                pendingVersion,
                StorageMigrationInterruptionReason.MIGRATION_NOT_RESUMABLE,
                `Migration to storage schema version ${pendingVersion} was interrupted and is declared as not resumable. Storage must be restored from an export or re-imported`,
            );
        }
    }

    public async run(): Promise<number> {
        const storedVersion: number = await this.resolveStoredVersion();

        if (storedVersion > this.currentVersion) {
            throw new StorageVersionDowngradeError(
                storedVersion,
                this.currentVersion,
            );
        }

        await this.assertInterruptedMigrationIsResumable();

        for (const migration of this.getPendingMigrations(storedVersion)) {
            await this.applyMigration(migration);
        }

        await this.metadataRepository.saveVersion(this.currentVersion);

        return this.currentVersion;
    }
}

export { STORAGE_MIGRATIONS };