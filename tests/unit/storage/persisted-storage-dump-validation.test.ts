import test from "node:test";
import assert from "node:assert/strict";

import Bip44Path from "@domains/Bip44Path";
import { PersistedStorageImportRejection } from "@domains/CustomError";
import { WalletTypes } from "@domains/Signer";
import { ITableRecord } from "@domains/TableService";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import KeysManager from "@services/KeysManager";
import WalletsService from "@services/Wallets";
import { PERSISTED_STORAGE_TABLES } from "@services/StorageBootstrap";
import {
    PERSISTED_STORAGE_DUMP_TYPE,
    PERSISTED_STORAGE_DUMP_VERSION,
    CURRENT_STORAGE_VERSION,
} from "@config/index";
import { encodeBase16 } from "@utils/codec";
import {
    TPersistedStorageDumpValidation,
    validatePersistedStorageDump,
    validatePersistedStorageTables,
} from "@utils/validators";

type TDumpTableRecord = Record<string, ITableRecord[string]>;

type TDumpTables = Record<string, TDumpTableRecord[]>;

const ENCRYPTED_DATA = {
    data: "ZW5jcnlwdGVk",
    salt: "c2FsdA==",
    iv: "aXY=",
    version: 2,
};

const CREATED_AT: number = 1_700_000_000_000;

const publicKey: Uint8Array = KeysManager.generateKeyPair().publicKey;

const createTables = (): TDumpTables => ({
    SIGNERS: [
        {
            id: "hd-wallet",
            type: WalletTypes.HD,
            encryptedData: ENCRYPTED_DATA,
            encryptedDataKey: ENCRYPTED_DATA,
            fingerprint: "hd-wallet-fingerprint",
            createdAt: CREATED_AT,
        },
        {
            id: "pk-wallet",
            type: WalletTypes.PRIVATE_KEY,
            encryptedData: ENCRYPTED_DATA,
            encryptedDataKey: ENCRYPTED_DATA,
            fingerprint: "pk-wallet-fingerprint",
            createdAt: CREATED_AT,
        },
    ],
    ACCOUNTS: [
        {
            id: "hd-main",
            signerId: "hd-wallet",
            name: "Main",
            index: 0,
            fingerprint: "hd-main-fingerprint",
            createdAt: CREATED_AT,
        },
        {
            id: "hd-second",
            signerId: "hd-wallet",
            name: "Second",
            index: 1,
            fingerprint: "hd-second-fingerprint",
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
        },
        {
            id: "pk-main",
            signerId: "pk-wallet",
            name: "Imported",
            index: null,
            fingerprint: "pk-main-fingerprint",
            createdAt: CREATED_AT,
        },
    ],
    TRANSACTION_RESERVATIONS: [
        {
            id: "reservation",
            signerId: "hd-wallet",
            networkId: "ScalaTestNet",
            encryptedData: ENCRYPTED_DATA,
            createdAt: CREATED_AT,
        },
    ],
    CUSTOM_NETWORKS: [
        {
            id: "custom-network",
            name: "Custom",
            config: {
                ValidatorURL: "http://custom-validator.test:40413",
                ReadOnlyURL: "http://custom-observer.test:40453",
                IndexerURL: "http://custom-indexer.test:8080/v1/graphql",
                nodeApiProfile: NodeApiProfile.RUST,
            },
            createdAt: CREATED_AT,
        },
    ],
    INSENSITIVE_CACHE: [
        {
            id: "hd-main",
            address: WalletsService.deriveAddressFromPublicKey(publicKey),
            publicKey: encodeBase16(publicKey),
            createdAt: CREATED_AT,
        },
    ],
});

const createDump = (): Record<string, unknown> => ({
    type: PERSISTED_STORAGE_DUMP_TYPE,
    version: PERSISTED_STORAGE_DUMP_VERSION,
    schemaVersion: CURRENT_STORAGE_VERSION,
    interruptedMigration: null,
    createdAt: new Date(CREATED_AT).toISOString(),
    encryptedTables: ENCRYPTED_DATA,
});

const findRecord = (
    tables: TDumpTables,
    tableName: string,
    id: string,
): TDumpTableRecord => {
    const record: TDumpTableRecord | undefined = tables[tableName].find(
        (tableRecord: TDumpTableRecord) => tableRecord.id === id,
    );

    assert.ok(record, `${tableName} has no record ${id}`);

    return record;
};

const describeValidation = (
    validation: TPersistedStorageDumpValidation,
): string =>
    validation.isValid
        ? "valid"
        : `${validation.rejection}: ${validation.error}`;

test("a dump header with an encrypted tables section is valid", () => {
    console.log("\n=== VALID DUMP HEADER ===");

    const validation: TPersistedStorageDumpValidation =
        validatePersistedStorageDump(createDump());

    console.log("    Validation:", describeValidation(validation));

    assert.equal(validation.isValid, true);
});

test("malformed dump headers are rejected with their reason", () => {
    console.log("\n=== MALFORMED DUMP HEADERS ===");

    const malformedHeaders: [
        string,
        unknown,
        PersistedStorageImportRejection,
    ][] = [
        ["not an object", 42, PersistedStorageImportRejection.INVALID_FORMAT],
        [
            "unknown envelope type",
            { ...createDump(), type: "asi-wallet-keyfile" },
            PersistedStorageImportRejection.UNKNOWN_ENVELOPE,
        ],
        [
            "unknown envelope version",
            { ...createDump(), version: PERSISTED_STORAGE_DUMP_VERSION + 1 },
            PersistedStorageImportRejection.UNKNOWN_ENVELOPE,
        ],
        [
            "invalid creation date",
            { ...createDump(), createdAt: "yesterday" },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "string schema version",
            { ...createDump(), schemaVersion: "1" },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "fractional schema version",
            { ...createDump(), schemaVersion: 1.5 },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "schema version newer than the build",
            { ...createDump(), schemaVersion: CURRENT_STORAGE_VERSION + 1 },
            PersistedStorageImportRejection.NEWER_SCHEMA,
        ],
        [
            "interrupted migration",
            {
                ...createDump(),
                interruptedMigration: {
                    pendingVersion: CURRENT_STORAGE_VERSION + 1,
                    rollbackFailed: true,
                },
            },
            PersistedStorageImportRejection.INTERRUPTED_MIGRATION,
        ],
        [
            "missing migration state",
            { ...createDump(), interruptedMigration: undefined },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "plaintext tables instead of an encrypted section",
            { ...createDump(), encryptedTables: createTables() },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
    ];

    for (const [reason, dump, rejection] of malformedHeaders) {
        const validation: TPersistedStorageDumpValidation =
            validatePersistedStorageDump(dump);

        console.log(`    ${reason}:`, describeValidation(validation));

        assert.equal(validation.isValid, false, reason);
        assert.equal(!validation.isValid && validation.rejection, rejection);
    }
});

test("decrypted tables of a consistent storage are valid", () => {
    console.log("\n=== VALID DUMP TABLES ===");

    const validation: TPersistedStorageDumpValidation =
        validatePersistedStorageTables(createTables(), PERSISTED_STORAGE_TABLES);

    console.log("    Validation:", describeValidation(validation));

    assert.equal(validation.isValid, true);

    const requiredTables: TDumpTables = createTables();

    delete requiredTables.CUSTOM_NETWORKS;
    delete requiredTables.INSENSITIVE_CACHE;

    assert.equal(
        validatePersistedStorageTables(requiredTables, PERSISTED_STORAGE_TABLES)
            .isValid,
        true,
        "tables missing from the dump count as empty",
    );
});

test("malformed decrypted tables are rejected with their reason", () => {
    console.log("\n=== MALFORMED DUMP TABLES ===");

    const malformedTables: [
        string,
        (tables: TDumpTables) => unknown,
        PersistedStorageImportRejection,
    ][] = [
        [
            "tables are a list",
            () => [],
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "unknown table",
            (tables) => ({ ...tables, EXTRA: [] }),
            PersistedStorageImportRejection.UNKNOWN_TABLE,
        ],
        [
            "metadata table",
            (tables) => ({ ...tables, STORAGE_METADATA: [] }),
            PersistedStorageImportRejection.UNKNOWN_TABLE,
        ],
        [
            "table is not a list",
            (tables) => ({ ...tables, SIGNERS: {} }),
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "record without an id",
            (tables) => {
                delete findRecord(tables, "SIGNERS", "hd-wallet").id;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "duplicate record id",
            (tables) => {
                tables.CUSTOM_NETWORKS.push(tables.CUSTOM_NETWORKS[0]);

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "record without a creation time",
            (tables) => {
                delete findRecord(tables, "ACCOUNTS", "hd-main").createdAt;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "record with an invalid update time",
            (tables) => {
                findRecord(tables, "ACCOUNTS", "hd-main").updatedAt = "now";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "unknown wallet type",
            (tables) => {
                findRecord(tables, "SIGNERS", "hd-wallet").type = "ledger";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "wallet without an encrypted secret",
            (tables) => {
                delete findRecord(tables, "SIGNERS", "hd-wallet").encryptedData;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "wallet with a damaged data key",
            (tables) => {
                findRecord(tables, "SIGNERS", "hd-wallet").encryptedDataKey = {
                    data: 1,
                };

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "wallet without a fingerprint",
            (tables) => {
                findRecord(tables, "SIGNERS", "hd-wallet").fingerprint = " ";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "duplicate wallet fingerprint",
            (tables) => {
                findRecord(tables, "SIGNERS", "pk-wallet").fingerprint =
                    "hd-wallet-fingerprint";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "account of a wallet missing from the dump",
            (tables) => {
                findRecord(tables, "ACCOUNTS", "hd-main").signerId = "ghost";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "account without a name",
            (tables) => {
                delete findRecord(tables, "ACCOUNTS", "hd-main").name;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "duplicate account fingerprint",
            (tables) => {
                findRecord(tables, "ACCOUNTS", "hd-second").fingerprint =
                    "hd-main-fingerprint";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "hd account without an index",
            (tables) => {
                findRecord(tables, "ACCOUNTS", "hd-main").index = null;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "hd index outside the bip-32 range",
            (tables) => {
                findRecord(tables, "ACCOUNTS", "hd-main").index =
                    Bip44Path.MAX_COMPONENT_VALUE + 1;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "duplicate hd index in one wallet",
            (tables) => {
                findRecord(tables, "ACCOUNTS", "hd-second").index = 0;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "private key account with an index",
            (tables) => {
                findRecord(tables, "ACCOUNTS", "pk-main").index = 0;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "private key wallet with two accounts",
            (tables) => {
                tables.ACCOUNTS.push({
                    ...findRecord(tables, "ACCOUNTS", "pk-main"),
                    id: "pk-second",
                    fingerprint: "pk-second-fingerprint",
                });

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "wallet without accounts",
            (tables) => {
                tables.ACCOUNTS = tables.ACCOUNTS.filter(
                    (account: TDumpTableRecord) => account.signerId !== "pk-wallet",
                );

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "reservation of a wallet missing from the dump",
            (tables) => {
                findRecord(
                    tables,
                    "TRANSACTION_RESERVATIONS",
                    "reservation",
                ).signerId = "ghost";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "reservation without a network",
            (tables) => {
                findRecord(
                    tables,
                    "TRANSACTION_RESERVATIONS",
                    "reservation",
                ).networkId = "";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "reservation without encrypted data",
            (tables) => {
                delete findRecord(
                    tables,
                    "TRANSACTION_RESERVATIONS",
                    "reservation",
                ).encryptedData;

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "network with a non http url",
            (tables) => {
                findRecord(
                    tables,
                    "CUSTOM_NETWORKS",
                    "custom-network",
                ).config.IndexerURL = "ftp://custom-indexer.test";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "network with an unknown node api profile",
            (tables) => {
                findRecord(
                    tables,
                    "CUSTOM_NETWORKS",
                    "custom-network",
                ).config.nodeApiProfile = "go";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "two networks with one name",
            (tables) => {
                const network: TDumpTableRecord = findRecord(
                    tables,
                    "CUSTOM_NETWORKS",
                    "custom-network",
                );

                tables.CUSTOM_NETWORKS.push({
                    ...network,
                    id: "another-network",
                    config: {
                        ...network.config,
                        IndexerURL: "http://another-indexer.test",
                    },
                });

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "cache record with an invalid address",
            (tables) => {
                findRecord(tables, "INSENSITIVE_CACHE", "hd-main").address =
                    "not-an-address";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
        [
            "cache record with a non hex public key",
            (tables) => {
                findRecord(tables, "INSENSITIVE_CACHE", "hd-main").publicKey =
                    "xyz";

                return tables;
            },
            PersistedStorageImportRejection.INVALID_FORMAT,
        ],
    ];

    for (const [reason, mutate, rejection] of malformedTables) {
        const validation: TPersistedStorageDumpValidation =
            validatePersistedStorageTables(
                mutate(createTables()),
                PERSISTED_STORAGE_TABLES,
            );

        console.log(`    ${reason}:`, describeValidation(validation));

        assert.equal(validation.isValid, false, reason);
        assert.equal(!validation.isValid && validation.rejection, rejection);
    }
});
