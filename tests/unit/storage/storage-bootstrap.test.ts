import test from "node:test";
import assert from "node:assert/strict";

import StorageBootstrap from "@services/StorageBootstrap";
import { SIGNERS_DATA_KEY } from "@domains/SignersStorageRepository";
import {
    STORAGE_METADATA_DATA_KEY,
    StorageMetadataStorageRepository,
} from "@domains/StorageMetadataStorageRepository";
import { StorageVersionDowngradeError } from "@domains/CustomError";
import { ITableRecord, ITableService } from "@domains/TableService";
import { CURRENT_STORAGE_VERSION } from "@config/index";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/storage-bootstrap" };

const UNSUPPORTED_STORAGE_VERSION: number = CURRENT_STORAGE_VERSION + 10;

const metadataRepository: StorageMetadataStorageRepository =
    StorageMetadataStorageRepository.getInstance(STORAGE_OPTIONS);

let storage: ITableService<ITableRecord>;

test.before(async () => {
    await metadataRepository.initialize();

    storage = metadataRepository.getRawDB();
});

test("a newer storage is rejected before any data table is created", async () => {
    console.log("\n=== NEWER STORAGE IS REJECTED BEFORE ANY WRITE ===");

    await metadataRepository.saveVersion(UNSUPPORTED_STORAGE_VERSION);

    console.log("    Tables before the init:", await storage.getTableNames());

    await assert.rejects(
        () => StorageBootstrap.init({ storageOptions: STORAGE_OPTIONS }),
        StorageVersionDowngradeError,
    );

    console.log(
        "    Tables after the failed init:",
        await storage.getTableNames(),
    );
    console.log("    Stored version:", await metadataRepository.getVersion());

    assert.deepEqual(await storage.getTableNames(), [
        STORAGE_METADATA_DATA_KEY,
    ]);
    assert.equal(await storage.tableExists(SIGNERS_DATA_KEY), false);
    assert.equal(
        await metadataRepository.getVersion(),
        UNSUPPORTED_STORAGE_VERSION,
    );
});

test("a supported storage is initialized and stamped", async () => {
    console.log("\n=== SUPPORTED STORAGE IS INITIALIZED ===");

    await metadataRepository.saveVersion(CURRENT_STORAGE_VERSION);

    await StorageBootstrap.init({ storageOptions: STORAGE_OPTIONS });

    console.log("    Tables after the init:", await storage.getTableNames());
    console.log("    Stored version:", await metadataRepository.getVersion());

    assert.equal(await storage.tableExists(SIGNERS_DATA_KEY), true);
    assert.equal(
        await metadataRepository.getVersion(),
        CURRENT_STORAGE_VERSION,
    );
});