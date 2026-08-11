import { ITableRecord, ITableService } from "@domains/TableService";
import { StorageMetadataStorageRepository } from "@domains/StorageMetadataStorageRepository";
import { StorageVersionDowngradeError } from "@domains/CustomError";
import {
    BASELINE_STORAGE_VERSION,
    CURRENT_STORAGE_VERSION,
} from "@config/index";
import { STORAGE_MIGRATIONS } from "./migrations";

export interface IStorageMigration {
    version: number;
    description: string;
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

    private async applyMigration(migration: IStorageMigration): Promise<void> {
        const backup: TTableBackup = await this.createBackup();

        try {
            await migration.run(this.storage);
        } catch (error) {
            await this.restoreBackup(backup);

            throw error;
        }

        await this.metadataRepository.saveVersion(migration.version);
    }

    public async run(): Promise<number> {
        const storedVersion: number = await this.resolveStoredVersion();

        if (storedVersion > this.currentVersion) {
            throw new StorageVersionDowngradeError(
                storedVersion,
                this.currentVersion,
            );
        }

        for (const migration of this.getPendingMigrations(storedVersion)) {
            await this.applyMigration(migration);
        }

        await this.metadataRepository.saveVersion(this.currentVersion);

        return this.currentVersion;
    }
}

export { STORAGE_MIGRATIONS };