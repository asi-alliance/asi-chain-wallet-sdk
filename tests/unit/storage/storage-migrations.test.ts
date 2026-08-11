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
import { StorageVersionDowngradeError } from "@domains/CustomError";
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
): StorageMigrationRunner =>
    new StorageMigrationRunner({
        storage,
        metadataRepository,
        tables: [SIGNERS_DATA_KEY],
        migrations,
        currentVersion,
    });

const createRecordingMigration = (
    version: number,
    applied: number[],
): IStorageMigration => ({
    version,
    description: `recording migration ${version}`,
    run: async () => {
        applied.push(version);
    },
});

const createFailingMigration = (version: number): IStorageMigration => ({
    version,
    description: `failing migration ${version}`,
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

const seedSigner = async (id: string): Promise<void> => {
    await signersRepository.saveSigner(
        id,
        WalletTypes.PRIVATE_KEY,
        ENCRYPTED_STUB,
        ENCRYPTED_STUB,
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

    await assert.rejects(() =>
        createRunner([createRecordingMigration(2, applied)], 1).run(),
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
        { version: 2, description: "first", run: readVersionOnStart },
        { version: 3, description: "second", run: readVersionOnStart },
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

    assert.deepEqual(versionsSeenOnStart, [null, 2]);
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