import test from "node:test";
import assert from "node:assert/strict";

import StorageMigrationRunner, {
    IStorageMigration,
    STORAGE_MIGRATIONS,
} from "@services/StorageMigrationRunner";
import {
    ISignerStorageRecord,
    SIGNERS_DATA_KEY,
    SignersStorageRepository,
} from "@domains/SignersStorageRepository";
import { StorageMetadataStorageRepository } from "@domains/StorageMetadataStorageRepository";
import {
    StorageMigrationChainError,
    StorageMigrationChainViolation,
    StorageMigrationFailedError,
    StorageMigrationInterruptedError,
    StorageMigrationInterruptionReason,
    StorageMigrationRollbackError,
    StorageVersionDowngradeError,
} from "@domains/CustomError";
import { ITableRecord, ITableService } from "@domains/TableService";
import { WalletTypes } from "@domains/Signer";
import { EncryptedData } from "@services/Crypto";
import { withSchemaVersion } from "@utils/functions";
import {
    BASELINE_STORAGE_VERSION,
    CURRENT_STORAGE_VERSION,
} from "@config/index";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/storage-migrations" };

const ENCRYPTED_STUB: EncryptedData = {
    data: "encrypted-data",
    salt: "salt",
    iv: "iv",
    version: 2,
};

const metadataRepository: StorageMetadataStorageRepository =
    new StorageMetadataStorageRepository(STORAGE_OPTIONS);

const signersRepository: SignersStorageRepository =
    new SignersStorageRepository(STORAGE_OPTIONS);

let storage: ITableService<ITableRecord>;

const createRunner = (
    migrations: IStorageMigration[],
    currentVersion: number,
    tableStorage: ITableService<ITableRecord> = storage,
): StorageMigrationRunner =>
    new StorageMigrationRunner({
        storage: tableStorage,
        metadataRepository,
        tables: [SIGNERS_DATA_KEY],
        migrations,
        currentVersion,
    });

const captureError = async (
    action: () => Promise<unknown>,
): Promise<unknown> => {
    try {
        await action();
    } catch (error: unknown) {
        return error;
    }

    throw new Error("Expected the action to reject, but it resolved");
};

const withFailingRestore = (
    target: ITableService<ITableRecord>,
    blockedTable: string,
): ITableService<ITableRecord> => {
    const blockedStorage: ITableService<ITableRecord> = Object.create(target);

    blockedStorage.insertMany = async (
        tableName: string,
        records: ITableRecord[],
    ): Promise<void> => {
        if (tableName === blockedTable) {
            throw new Error(`Table ${tableName} is not writable`);
        }

        await target.insertMany(tableName, records);
    };

    return blockedStorage;
};

const createRecordingMigration = (
    version: number,
    applied: number[],
): IStorageMigration => ({
    version,
    resumable: true,
    description: `recording migration ${version}`,
    run: async () => {
        applied.push(version);
    },
});

const createFailingMigration = (version: number): IStorageMigration => ({
    version,
    description: `failing migration ${version}`,
    resumable: false,
    run: async (tableStorage: ITableService<ITableRecord>) => {
        await tableStorage.insert(SIGNERS_DATA_KEY, {
            id: "signer-written-by-migration",
            type: WalletTypes.PRIVATE_KEY,
            encryptedData: ENCRYPTED_STUB,
            encryptedDataKey: ENCRYPTED_STUB,
            createdAt: Date.now(),
        });

        throw new Error("Migration failed");
    },
});

const createTableCreatingMigration = (
    version: number,
    tableName: string,
): IStorageMigration => ({
    version,
    description: `table creating migration ${version}`,
    resumable: true,
    run: async (tableStorage: ITableService<ITableRecord>) => {
        await tableStorage.createTable(tableName, "id");

        await tableStorage.insert(tableName, { id: "record-of-new-table" });

        throw new Error("Migration failed after creating a table");
    },
});

const createTableDroppingMigration = (
    version: number,
    tableName: string,
): IStorageMigration => ({
    version,
    description: `table dropping migration ${version}`,
    resumable: false,
    run: async (tableStorage: ITableService<ITableRecord>) => {
        await tableStorage.dropTable(tableName);

        throw new Error("Migration failed after dropping a table");
    },
});

const seedSigner = async (id: string): Promise<void> => {
    await signersRepository.saveSigner(
        id,
        WalletTypes.PRIVATE_KEY,
        ENCRYPTED_STUB,
        ENCRYPTED_STUB,
        `fingerprint-${id}`,
    );
};

const readSignerIds = async (): Promise<string[]> => {
    const records: ISignerStorageRecord[] =
        await signersRepository.getAllSigners();

    return records.map((record: ISignerStorageRecord) => record.id).sort();
};

test.before(async () => {
    await metadataRepository.initialize();
    await signersRepository.initialize();

    storage = metadataRepository.getRawDB();
});

test.afterEach(async () => {
    await metadataRepository.clearAllData();
    await signersRepository.clearAllData();
});

test("clean storage is stamped with the baseline schema version", async () => {
    console.log("\n=== CLEAN STORAGE IS STAMPED ===");

    const appliedVersion: number = await createRunner(
        [],
        CURRENT_STORAGE_VERSION,
    ).run();

    console.log("    Version returned by the runner:", appliedVersion);
    console.log(
        "    Version persisted:",
        await metadataRepository.getVersion(),
    );

    assert.equal(appliedVersion, BASELINE_STORAGE_VERSION);
    assert.equal(
        await metadataRepository.getVersion(),
        BASELINE_STORAGE_VERSION,
    );
});

test("clean storage runs no migrations of the shipped list", async () => {
    console.log("\n=== SHIPPED MIGRATION LIST IS EMPTY ===");

    console.log("    Shipped migrations:", STORAGE_MIGRATIONS.length);

    assert.equal(STORAGE_MIGRATIONS.length, 0);

    const runner: StorageMigrationRunner = new StorageMigrationRunner({
        storage,
        metadataRepository,
        tables: [SIGNERS_DATA_KEY],
    });

    const appliedVersion: number = await runner.run();

    console.log("    Version after run:", appliedVersion);

    assert.equal(appliedVersion, CURRENT_STORAGE_VERSION);
});

test("existing storage without a schema stamp is read as the baseline version", async () => {
    console.log("\n=== UNSTAMPED STORAGE IS BASELINE ===");

    await seedSigner("signer-1");

    console.log(
        "    Stored version stamp:",
        await metadataRepository.getVersion(),
    );

    const applied: number[] = [];

    const appliedVersion: number = await createRunner(
        [createRecordingMigration(2, applied)],
        2,
    ).run();

    console.log("    Migrations applied:", applied);
    console.log("    Signers kept:", await readSignerIds());

    assert.deepEqual(applied, [2]);
    assert.equal(appliedVersion, 2);
    assert.deepEqual(await readSignerIds(), ["signer-1"]);
});

test("storage of a newer version throws StorageVersionDowngradeError", async () => {
    console.log("\n=== NEWER STORAGE IS REJECTED ===");

    await metadataRepository.saveVersion(5);

    console.log("    Stored version:", await metadataRepository.getVersion());
    console.log("    Supported version:", 1);

    await assert.rejects(
        () => createRunner([], 1).run(),
        StorageVersionDowngradeError,
    );
});

test("downgrade detection does not modify storage", async () => {
    console.log("\n=== DOWNGRADE LEAVES STORAGE UNTOUCHED ===");

    await seedSigner("signer-1");
    await metadataRepository.saveVersion(5);

    const applied: number[] = [];

    await assert.rejects(
        () => createRunner([createRecordingMigration(2, applied)], 1).run(),
        StorageVersionDowngradeError,
    );

    console.log("    Migrations applied:", applied);
    console.log(
        "    Version still stored:",
        await metadataRepository.getVersion(),
    );
    console.log("    Signers kept:", await readSignerIds());

    assert.deepEqual(applied, []);
    assert.equal(await metadataRepository.getVersion(), 5);
    assert.deepEqual(await readSignerIds(), ["signer-1"]);
});

test("pending migrations run in ascending version order", async () => {
    console.log("\n=== MIGRATIONS RUN IN ORDER ===");

    const applied: number[] = [];

    await createRunner(
        [
            createRecordingMigration(3, applied),
            createRecordingMigration(2, applied),
        ],
        3,
    ).run();

    console.log("    Order of applied migrations:", applied);

    assert.deepEqual(applied, [2, 3]);
});

test("schema version is persisted after every successful migration", async () => {
    console.log("\n=== VERSION IS PERSISTED PER MIGRATION ===");

    const versionsSeenOnStart: (number | null)[] = [];

    const readVersionOnStart = async (): Promise<void> => {
        versionsSeenOnStart.push(await metadataRepository.getVersion());
    };

    const migrations: IStorageMigration[] = [
        {
            version: 2,
            description: "first",
            resumable: true,
            run: readVersionOnStart,
        },
        {
            version: 3,
            description: "second",
            resumable: true,
            run: readVersionOnStart,
        },
    ];

    await createRunner(migrations, 3).run();

    console.log(
        "    Versions observed on migration start:",
        versionsSeenOnStart,
    );
    console.log(
        "    Version after run:",
        await metadataRepository.getVersion(),
    );

    assert.deepEqual(versionsSeenOnStart, [BASELINE_STORAGE_VERSION, 2]);
    assert.equal(await metadataRepository.getVersion(), 3);
});

test("a failing migration restores affected tables from the backup", async () => {
    console.log("\n=== FAILED MIGRATION RESTORES TABLES ===");

    await seedSigner("signer-1");

    console.log("    Signers before migration:", await readSignerIds());

    await assert.rejects(() =>
        createRunner([createFailingMigration(2)], 2).run(),
    );

    console.log("    Signers after failure:", await readSignerIds());

    assert.deepEqual(await readSignerIds(), ["signer-1"]);
});

test("a failing migration leaves the previously stored version unchanged", async () => {
    console.log("\n=== FAILED MIGRATION KEEPS THE VERSION ===");

    await metadataRepository.saveVersion(1);

    await assert.rejects(() =>
        createRunner([createFailingMigration(2)], 2).run(),
    );

    console.log(
        "    Version after failure:",
        await metadataRepository.getVersion(),
    );

    assert.equal(await metadataRepository.getVersion(), 1);
});

test("a record without schemaVersion is read as the baseline version", () => {
    console.log("\n=== MISSING RECORD VERSION IS BASELINE ===");

    const unstampedRecord: ITableRecord = { id: "unstamped-record" };

    const stampedRecord: ITableRecord = {
        id: "stamped-record",
        schemaVersion: 7,
    };

    const unstamped: ITableRecord = withSchemaVersion(unstampedRecord);
    const stamped: ITableRecord = withSchemaVersion(stampedRecord);

    console.log("    Unstamped record version:", unstamped.schemaVersion);
    console.log("    Stamped record version:", stamped.schemaVersion);

    assert.equal(unstamped.schemaVersion, BASELINE_STORAGE_VERSION);
    assert.equal(stamped.schemaVersion, 7);
});

test("a failing migration rejects with a typed storage error", async () => {
    console.log("\n=== FAILED MIGRATION IS TYPED ===");

    const error: unknown = await captureError(() =>
        createRunner([createFailingMigration(2)], 2).run(),
    );

    assert.ok(error instanceof StorageMigrationFailedError);

    console.log("    Error code:", error.code);
    console.log("    Failed version:", error.failedVersion);
    console.log("    Storage left on version:", error.storedVersion);
    console.log("    Storage intact:", error.isStorageIntact);

    assert.equal(error.failedVersion, 2);
    assert.equal(error.storedVersion, BASELINE_STORAGE_VERSION);
    assert.equal(error.isStorageIntact, true);
    assert.ok(error.migrationError instanceof Error);
});

test("the journal marks a migration in flight and clears it on success", async () => {
    console.log("\n=== JOURNAL IS SET AND CLEARED ===");

    const pendingVersionsSeen: (number | null)[] = [];

    const migrations: IStorageMigration[] = [
        {
            version: 2,
            description: "journal probe",
            resumable: true,
            run: async () => {
                pendingVersionsSeen.push(
                    await metadataRepository.getPendingVersion(),
                );
            },
        },
    ];

    await createRunner(migrations, 2).run();

    console.log("    Journal seen inside the migration:", pendingVersionsSeen);
    console.log(
        "    Journal after the run:",
        await metadataRepository.getPendingVersion(),
    );

    assert.deepEqual(pendingVersionsSeen, [2]);
    assert.equal(await metadataRepository.getPendingVersion(), null);
});

test("a failed migration with a successful rollback clears the journal", async () => {
    console.log("\n=== SUCCESSFUL ROLLBACK CLEARS THE JOURNAL ===");

    await seedSigner("signer-1");

    await assert.rejects(() =>
        createRunner([createFailingMigration(2)], 2).run(),
    );

    console.log(
        "    Journal after the failure:",
        await metadataRepository.getPendingVersion(),
    );
    console.log(
        "    Rollback failure recorded:",
        await metadataRepository.getRollbackFailure(),
    );

    assert.equal(await metadataRepository.getPendingVersion(), null);
    assert.equal(await metadataRepository.getRollbackFailure(), null);
});

test("a leftover journal entry replays the interrupted migration", async () => {
    console.log("\n=== INTERRUPTED MIGRATION IS REPLAYED ===");

    await metadataRepository.markPendingMigration(2);

    const applied: number[] = [];

    const appliedVersion: number = await createRunner(
        [createRecordingMigration(2, applied)],
        2,
    ).run();

    console.log("    Migrations applied:", applied);
    console.log("    Version after the run:", appliedVersion);

    assert.deepEqual(applied, [2]);
    assert.equal(appliedVersion, 2);
    assert.equal(await metadataRepository.getPendingVersion(), null);
});

test("a leftover journal entry of an unknown migration is rejected", async () => {
    console.log("\n=== UNKNOWN INTERRUPTED MIGRATION IS REJECTED ===");

    await metadataRepository.markPendingMigration(5);

    const applied: number[] = [];

    const error: unknown = await captureError(() =>
        createRunner([createRecordingMigration(2, applied)], 2).run(),
    );

    assert.ok(error instanceof StorageMigrationInterruptedError);

    console.log("    Interruption reason:", error.reason);
    console.log("    Migrations applied:", applied);

    assert.equal(
        error.reason,
        StorageMigrationInterruptionReason.MIGRATION_NOT_FOUND,
    );
    assert.equal(error.pendingVersion, 5);
    assert.equal(error.isStorageIntact, false);
    assert.deepEqual(applied, []);
});

test("a leftover journal entry of a non resumable migration is rejected", async () => {
    console.log("\n=== NON RESUMABLE MIGRATION IS REJECTED ===");

    await metadataRepository.markPendingMigration(2);

    const applied: number[] = [];

    const migrations: IStorageMigration[] = [
        {
            version: 2,
            description: "non resumable migration",
            resumable: false,
            run: async () => {
                applied.push(2);
            },
        },
    ];

    const error: unknown = await captureError(() =>
        createRunner(migrations, 2).run(),
    );

    assert.ok(error instanceof StorageMigrationInterruptedError);

    console.log("    Interruption reason:", error.reason);
    console.log("    Migrations applied:", applied);

    assert.equal(
        error.reason,
        StorageMigrationInterruptionReason.MIGRATION_NOT_RESUMABLE,
    );
    assert.deepEqual(applied, []);
});

test("a failing migration drops the table it created", async () => {
    console.log("\n=== ROLLBACK DROPS A CREATED TABLE ===");

    const createdTable: string = "migration-created-table";

    await assert.rejects(() =>
        createRunner([createTableCreatingMigration(2, createdTable)], 2).run(),
    );

    console.log("    Tables after the failure:", await storage.getTableNames());

    assert.equal(await storage.tableExists(createdTable), false);
});

test("a failing migration restores the table it dropped", async () => {
    console.log("\n=== ROLLBACK RESTORES A DROPPED TABLE ===");

    await seedSigner("signer-1");

    await assert.rejects(() =>
        createRunner(
            [createTableDroppingMigration(2, SIGNERS_DATA_KEY)],
            2,
        ).run(),
    );

    console.log(
        "    Signers table exists:",
        await storage.tableExists(SIGNERS_DATA_KEY),
    );
    console.log("    Signers after the failure:", await readSignerIds());

    assert.equal(await storage.tableExists(SIGNERS_DATA_KEY), true);
    assert.deepEqual(await readSignerIds(), ["signer-1"]);
});

test("a failing rollback reports damaged storage and blocks the next start", async () => {
    console.log("\n=== FAILED ROLLBACK BLOCKS THE NEXT START ===");

    await seedSigner("signer-1");

    const error: unknown = await captureError(() =>
        createRunner(
            [createFailingMigration(2)],
            2,
            withFailingRestore(storage, SIGNERS_DATA_KEY),
        ).run(),
    );

    assert.ok(error instanceof StorageMigrationRollbackError);

    console.log("    Rollback failures:", error.failures);
    console.log("    Storage intact:", error.isStorageIntact);
    console.log(
        "    Journal after the failure:",
        await metadataRepository.getPendingVersion(),
    );

    assert.equal(error.failedVersion, 2);
    assert.equal(error.isStorageIntact, false);
    assert.ok(error.failures.length > 0);
    assert.ok(error.migrationError instanceof Error);
    assert.ok(await metadataRepository.getRollbackFailure());
    assert.equal(await metadataRepository.getPendingVersion(), 2);

    const nextStartError: unknown = await captureError(() =>
        createRunner([createFailingMigration(2)], 2).run(),
    );

    assert.ok(nextStartError instanceof StorageMigrationInterruptedError);

    console.log("    Next start reason:", nextStartError.reason);

    assert.equal(
        nextStartError.reason,
        StorageMigrationInterruptionReason.ROLLBACK_FAILED,
    );
});

test("duplicate migration versions are rejected", async () => {
    console.log("\n=== DUPLICATE VERSIONS ARE REJECTED ===");

    const applied: number[] = [];

    const error: unknown = await captureError(() =>
        createRunner(
            [
                createRecordingMigration(2, applied),
                createRecordingMigration(2, applied),
            ],
            2,
        ).run(),
    );

    assert.ok(error instanceof StorageMigrationChainError);

    console.log("    Violation:", error.violation);
    console.log("    Versions:", error.versions);
    console.log("    Migrations applied:", applied);

    assert.equal(
        error.violation,
        StorageMigrationChainViolation.DUPLICATE_VERSION,
    );
    assert.deepEqual(error.versions, [2]);
    assert.deepEqual(applied, []);
});

test("a migration newer than the supported version is rejected", async () => {
    console.log("\n=== VERSION ABOVE THE SUPPORTED ONE IS REJECTED ===");

    const applied: number[] = [];

    const error: unknown = await captureError(() =>
        createRunner(
            [
                createRecordingMigration(2, applied),
                createRecordingMigration(3, applied),
            ],
            2,
        ).run(),
    );

    assert.ok(error instanceof StorageMigrationChainError);

    console.log("    Violation:", error.violation);
    console.log("    Versions:", error.versions);

    assert.equal(
        error.violation,
        StorageMigrationChainViolation.VERSION_OUT_OF_RANGE,
    );
    assert.deepEqual(error.versions, [3]);
    assert.deepEqual(applied, []);
});

test("a migration of the baseline version is rejected", async () => {
    console.log("\n=== BASELINE VERSION MIGRATION IS REJECTED ===");

    const applied: number[] = [];

    const error: unknown = await captureError(() =>
        createRunner(
            [createRecordingMigration(BASELINE_STORAGE_VERSION, applied)],
            2,
        ).run(),
    );

    assert.ok(error instanceof StorageMigrationChainError);

    console.log("    Violation:", error.violation);
    console.log("    Versions:", error.versions);

    assert.equal(
        error.violation,
        StorageMigrationChainViolation.VERSION_OUT_OF_RANGE,
    );
    assert.deepEqual(error.versions, [BASELINE_STORAGE_VERSION]);
});

test("a gap in the migration chain is rejected", async () => {
    console.log("\n=== SKIPPED VERSION IS REJECTED ===");

    const applied: number[] = [];

    const error: unknown = await captureError(() =>
        createRunner(
            [
                createRecordingMigration(2, applied),
                createRecordingMigration(4, applied),
            ],
            4,
        ).run(),
    );

    assert.ok(error instanceof StorageMigrationChainError);

    console.log("    Violation:", error.violation);
    console.log("    Missing versions:", error.versions);
    console.log("    Migrations applied:", applied);

    assert.equal(
        error.violation,
        StorageMigrationChainViolation.MISSING_MIGRATION,
    );
    assert.deepEqual(error.versions, [3]);
    assert.deepEqual(applied, []);
});
