import { ITableRecord, ITableService } from "@domains/TableService";
import {
    STORAGE_METADATA_DATA_KEY,
    StorageMetadataStorageRepository,
} from "@domains/StorageMetadataStorageRepository";
import {
    StorageMigrationChainError,
    StorageMigrationChainViolation,
    StorageMigrationFailedError,
    StorageMigrationInterruptedError,
    StorageMigrationInterruptionReason,
    StorageMigrationRollbackError,
    StorageSchemaError,
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

type TTableRecords = Record<string, ITableRecord[]>;

interface IStorageBackup {
    records: TTableRecords;
    tables: string[];
}

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

    private describeFailure(scope: string, error: unknown): string {
        const reason: string =
            error instanceof Error ? error.message : String(error);

        return `${scope}: ${reason}`;
    }

    private async createBackup(): Promise<IStorageBackup> {
        const tables: string[] = await this.storage.getTableNames();
        const records: TTableRecords = {};

        for (const tableName of this.tables) {
            if (tables.includes(tableName)) {
                records[tableName] = await this.storage.getAll(tableName);
            }
        }

        return { records, tables };
    }

    private async dropTablesCreatedByMigration(
        backup: IStorageBackup,
    ): Promise<string[]> {
        const failures: string[] = [];

        let currentTables: string[];

        try {
            currentTables = await this.storage.getTableNames();
        } catch (error: unknown) {
            return [this.describeFailure("reading the table list", error)];
        }

        const createdTables: string[] = currentTables.filter(
            (tableName: string) =>
                tableName !== STORAGE_METADATA_DATA_KEY &&
                !backup.tables.includes(tableName),
        );

        for (const tableName of createdTables) {
            try {
                await this.storage.dropTable(tableName);
            } catch (error: unknown) {
                failures.push(
                    this.describeFailure(`dropping ${tableName}`, error),
                );
            }
        }

        return failures;
    }

    private async restoreTable(
        tableName: string,
        records: ITableRecord[],
    ): Promise<void> {
        if (!(await this.storage.tableExists(tableName))) {
            await this.storage.createTable(tableName, "id");
        }

        await this.storage.clearTable(tableName);

        await this.storage.insertMany(tableName, records);
    }

    private async restoreBackup(backup: IStorageBackup): Promise<string[]> {
        const failures: string[] =
            await this.dropTablesCreatedByMigration(backup);

        for (const [tableName, records] of Object.entries(backup.records)) {
            try {
                await this.restoreTable(tableName, records);
            } catch (error: unknown) {
                failures.push(
                    this.describeFailure(`restoring ${tableName}`, error),
                );
            }
        }

        return failures;
    }

    private async revertMigration(
        version: number,
        backup: IStorageBackup,
        migrationError: unknown,
    ): Promise<void> {
        const failures: string[] = await this.restoreBackup(backup);

        if (failures.length) {
            await this.metadataRepository.markRollbackFailure(
                failures.join("; "),
            );

            throw new StorageMigrationRollbackError(
                version,
                failures,
                migrationError,
            );
        }

        await this.metadataRepository.clearPendingMigration();
    }

    private async runMigrationStep(
        migration: IStorageMigration,
    ): Promise<void> {
        const backup: IStorageBackup = await this.createBackup();

        await this.metadataRepository.markPendingMigration(migration.version);

        try {
            await migration.run(this.storage);

            await this.metadataRepository.saveVersion(migration.version);
        } catch (error) {
            await this.revertMigration(migration.version, backup, error);

            throw error;
        }
    }

    private async applyMigration(migration: IStorageMigration): Promise<void> {
        try {
            await this.runMigrationStep(migration);
        } catch (error: unknown) {
            if (error instanceof StorageSchemaError) {
                throw error;
            }

            throw new StorageMigrationFailedError(
                migration.version,
                migration.description,
                await this.resolveStoredVersion(),
                error,
            );
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

    private assertDeclaredVersionsAreValid(): void {
        const versions: number[] = this.migrations.map(
            (migration: IStorageMigration) => migration.version,
        );

        const duplicated: number[] = versions.filter(
            (version: number, index: number) =>
                versions.indexOf(version) !== index,
        );

        if (duplicated.length) {
            throw new StorageMigrationChainError(
                StorageMigrationChainViolation.DUPLICATE_VERSION,
                duplicated,
                `Storage schema versions ${duplicated.join(", ")} are declared by more than one migration, every version must have exactly one migration`,
            );
        }

        const outOfRange: number[] = versions.filter(
            (version: number) =>
                version <= BASELINE_STORAGE_VERSION ||
                version > this.currentVersion,
        );

        if (outOfRange.length) {
            throw new StorageMigrationChainError(
                StorageMigrationChainViolation.VERSION_OUT_OF_RANGE,
                outOfRange,
                `Storage migrations declare versions ${outOfRange.join(", ")} outside of the supported range ${BASELINE_STORAGE_VERSION + 1}..${this.currentVersion}`,
            );
        }
    }

    private assertChainIsComplete(storedVersion: number): void {
        const declaredVersions: Set<number> = new Set(
            this.migrations.map(
                (migration: IStorageMigration) => migration.version,
            ),
        );

        const missing: number[] = [];

        for (
            let version = storedVersion + 1;
            version <= this.currentVersion;
            version += 1
        ) {
            if (!declaredVersions.has(version)) {
                missing.push(version);
            }
        }

        if (missing.length) {
            throw new StorageMigrationChainError(
                StorageMigrationChainViolation.MISSING_MIGRATION,
                missing,
                `Storage schema versions ${missing.join(", ")} have no migration, storage cannot be upgraded from version ${storedVersion} to version ${this.currentVersion} without skipping a step`,
            );
        }
    }

    public async assertCompatible(): Promise<void> {
        const storedVersion: number = await this.resolveStoredVersion();

        if (storedVersion > this.currentVersion) {
            throw new StorageVersionDowngradeError(
                storedVersion,
                this.currentVersion,
            );
        }

        this.assertDeclaredVersionsAreValid();

        this.assertChainIsComplete(storedVersion);

        await this.assertInterruptedMigrationIsResumable();
    }

    public async run(): Promise<number> {
        await this.assertCompatible();

        const storedVersion: number = await this.resolveStoredVersion();

        for (const migration of this.getPendingMigrations(storedVersion)) {
            await this.applyMigration(migration);
        }

        await this.metadataRepository.saveVersion(this.currentVersion);

        return this.currentVersion;
    }
}

export { STORAGE_MIGRATIONS };