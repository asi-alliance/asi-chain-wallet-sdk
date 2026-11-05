import { TestContext } from "node:test";
import assert from "node:assert/strict";

import Client from "@domains/Client";
import Wallet from "@domains/Wallet";
import Account from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";
import { INetworkRecord } from "@domains/Network";
import { ITableRecord, ITableService } from "@domains/TableService";
import {
    STORAGE_METADATA_DATA_KEY,
    STORAGE_SCHEMA_RECORD_ID,
    StorageMetadataStorageRepository,
} from "@domains/StorageMetadataStorageRepository";
import { SIGNERS_DATA_KEY } from "@domains/SignersStorageRepository";
import { ACCOUNTS_DATA_KEY } from "@domains/AccountsStorageRepository";
import { CUSTOM_NETWORKS_DATA_KEY } from "@domains/CustomNetworksStorageRepository";
import { INSENSITIVE_CACHE_TABLE_KEY } from "@domains/InsensitiveCacheStorageRepository";
import {
    PersistedStorageExportError,
    PersistedStorageImportError,
    PersistedStorageImportRejectedError,
    PersistedStorageImportRejection,
    StorageMigrationFailedError,
    StorageMigrationInterruptedError,
    StorageVersionDowngradeError,
} from "@domains/CustomError";
import { IStorageFabricOptions, storageFabric } from "@fabrics/storage";
import ExportPersistedStorageService, {
    IPersistedStorageDump,
} from "@services/ExportPersistedStorageService";
import ImportPersistedStorageService from "@services/ImportPersistedStorageService";
import { PERSISTED_STORAGE_TABLES } from "@services/StorageBootstrap";
import StorageMigrationRunner from "@services/StorageMigrationRunner";
import KeysManager from "@services/KeysManager";
import {
    BASELINE_STORAGE_VERSION,
    CURRENT_STORAGE_VERSION,
    PERSISTED_STORAGE_DUMP_VERSION,
} from "@config/index";
import {
    CUSTOM_NETWORK_CONFIG,
    NETWORKS_CONFIG,
    SCALA_NETWORK,
} from "../network-flow/networks";

const WALLET_PASSWORD: string = "wallet-password";
const BACKUP_PASSWORD: string = "backup-password";
const CUSTOM_NETWORK_NAME: string = "Custom backup network";
const ACCOUNT_NAMES: string[] = ["Imported account", "Main account", "Second account"];

const createPasswordProvider = (password: string): SecretsProvider =>
    new SecretsProvider(() => ({ password }));

const isRejectedWith =
    (rejection: PersistedStorageImportRejection) =>
    (error: unknown): boolean =>
        error instanceof PersistedStorageImportRejectedError &&
        error.rejection === rejection;

export const runPersistedStorageDumpContract = (
    test: TestContext["test"],
    storageOptions: IStorageFabricOptions,
): void => {
    const storage: ITableService<ITableRecord> = storageFabric(storageOptions);

    const metadataRepository: StorageMetadataStorageRepository =
        StorageMetadataStorageRepository.getInstance(storageOptions);

    const createClient = (): Promise<Client> =>
        Client.create({
            networksConfig: NETWORKS_CONFIG,
            defaultNetwork: SCALA_NETWORK,
            storageOptions,
            flags: { withInsensitiveCacheStorage: true },
        });

    const clearTables = async (keepMetadata: boolean): Promise<void> => {
        await storage.init();

        for (const tableName of await storage.getTableNames()) {
            if (!keepMetadata || tableName !== STORAGE_METADATA_DATA_KEY) {
                await storage.clearTable(tableName);
            }
        }
    };

    const seedStorage = async (): Promise<void> => {
        await clearTables(false);

        const client: Client = await createClient();

        const hdWallet: Wallet = await client.createHDWallet(
            {
                mnemonic: client.generateMnemonic(),
                accountName: "Main account",
            },
            WALLET_PASSWORD,
        );

        await client.deriveAccount(
            hdWallet.getId(),
            "Second account",
            WALLET_PASSWORD,
        );

        await client.createPrivateKeyWallet(
            {
                privateKey: KeysManager.generateKeyPair().privateKey,
                accountName: "Imported account",
            },
            WALLET_PASSWORD,
        );

        await client.addNetwork(CUSTOM_NETWORK_NAME, CUSTOM_NETWORK_CONFIG);

        await client.close();
    };

    const exportStorage = (): Promise<IPersistedStorageDump> =>
        ExportPersistedStorageService.exportPersistedStorage(
            createPasswordProvider(BACKUP_PASSWORD),
            storageOptions,
        );

    const importStorage = (
        source: unknown,
        password: string = BACKUP_PASSWORD,
    ): Promise<void> =>
        ImportPersistedStorageService.importPersistedStorage(
            source,
            createPasswordProvider(password),
            storageOptions,
        );

    const countRecords = async (tableName: string): Promise<number> =>
        (await storage.getAll(tableName)).length;

    test("export reads a storage that a client refuses as newer", async () => {
        await seedStorage();

        await metadataRepository.saveVersion(CURRENT_STORAGE_VERSION + 10);

        await assert.rejects(() => createClient(), StorageVersionDowngradeError);

        const dump: IPersistedStorageDump = await exportStorage();

        assert.equal(dump.schemaVersion, CURRENT_STORAGE_VERSION + 10);
        assert.equal(dump.interruptedMigration, null);
    });

    test("export reads a storage that a client refuses as interrupted", async () => {
        await seedStorage();

        await metadataRepository.markPendingMigration(
            CURRENT_STORAGE_VERSION + 1,
        );
        await metadataRepository.markRollbackFailure("restoring SIGNERS");

        await assert.rejects(
            () => createClient(),
            StorageMigrationInterruptedError,
        );

        const dump: IPersistedStorageDump = await exportStorage();

        assert.deepEqual(dump.interruptedMigration, {
            pendingVersion: CURRENT_STORAGE_VERSION + 1,
            rollbackFailed: true,
        });

        await assert.rejects(
            () => importStorage(dump),
            isRejectedWith(PersistedStorageImportRejection.INTERRUPTED_MIGRATION),
        );
    });

    test("export reads a storage after a failed and rolled back migration", async () => {
        await seedStorage();

        const runner: StorageMigrationRunner = new StorageMigrationRunner({
            storage,
            metadataRepository,
            tables: Object.values(PERSISTED_STORAGE_TABLES),
            currentVersion: CURRENT_STORAGE_VERSION + 1,
            migrations: [
                {
                    version: CURRENT_STORAGE_VERSION + 1,
                    description: "a defective migration",
                    resumable: true,
                    run: async () => {
                        throw new Error("migration defect");
                    },
                },
            ],
        });

        await assert.rejects(() => runner.run(), StorageMigrationFailedError);

        const dump: IPersistedStorageDump = await exportStorage();

        assert.equal(dump.schemaVersion, CURRENT_STORAGE_VERSION);
        assert.equal(dump.interruptedMigration, null);

        await clearTables(true);
        await importStorage(dump);

        assert.equal(await countRecords(ACCOUNTS_DATA_KEY), ACCOUNT_NAMES.length);
    });

    test("export stamps a storage without a schema version as baseline", async () => {
        await seedStorage();

        await storage.delete(STORAGE_METADATA_DATA_KEY, STORAGE_SCHEMA_RECORD_ID);

        const dump: IPersistedStorageDump = await exportStorage();

        assert.equal(dump.schemaVersion, BASELINE_STORAGE_VERSION);
    });

    test("export refuses an empty backup password", async () => {
        await seedStorage();

        await assert.rejects(
            () =>
                ExportPersistedStorageService.exportPersistedStorage(
                    createPasswordProvider("   "),
                    storageOptions,
                ),
            PersistedStorageExportError,
        );
    });

    test("export leaves no account or network metadata in plaintext", async () => {
        await seedStorage();

        const plaintextMetadata: string[] = [
            CUSTOM_NETWORK_NAME,
            ...(await storage.getAll(ACCOUNTS_DATA_KEY)).flatMap(
                (account: ITableRecord) => [account.name, account.fingerprint],
            ),
            ...(await storage.getAll(SIGNERS_DATA_KEY)).map(
                (signer: ITableRecord) => signer.fingerprint,
            ),
            ...(await storage.getAll(INSENSITIVE_CACHE_TABLE_KEY)).map(
                (record: ITableRecord) => record.address,
            ),
        ];

        const dumpJson: string = JSON.stringify(await exportStorage());

        assert.deepEqual(
            plaintextMetadata.filter((value: string) => dumpJson.includes(value)),
            [],
        );
    });

    test("import restores wallets that a new client opens", async () => {
        await seedStorage();

        const signerIds: string[] = (await storage.getAll(SIGNERS_DATA_KEY)).map(
            (signer: ITableRecord) => signer.id,
        );

        const dumpJson: string = JSON.stringify(await exportStorage());

        await clearTables(false);
        await importStorage(dumpJson);

        const client: Client = await createClient();

        try {
            const accountNames: string[] = [];

            for (const signerId of signerIds) {
                const wallet: Wallet = await client.openWallet(
                    signerId,
                    WALLET_PASSWORD,
                );

                accountNames.push(
                    ...wallet
                        .getAccounts()
                        .map((account: Account) => account.getName()),
                );
            }

            assert.deepEqual(accountNames.sort(), ACCOUNT_NAMES);
            assert.ok(
                client
                    .getNetworks()
                    .some(
                        (network: INetworkRecord) =>
                            network.name === CUSTOM_NETWORK_NAME,
                    ),
            );
            assert.equal(
                await metadataRepository.getVersion(),
                CURRENT_STORAGE_VERSION,
            );
        } finally {
            await client.close();
        }
    });

    test("import refuses a storage that already holds records", async () => {
        await seedStorage();

        const dump: IPersistedStorageDump = await exportStorage();

        await assert.rejects(
            () => importStorage(dump),
            isRejectedWith(PersistedStorageImportRejection.STORAGE_NOT_EMPTY),
        );

        assert.equal(await countRecords(ACCOUNTS_DATA_KEY), ACCOUNT_NAMES.length);
    });

    test("import refuses a wrong backup password", async () => {
        await seedStorage();

        const dump: IPersistedStorageDump = await exportStorage();

        await clearTables(true);

        await assert.rejects(
            () => importStorage(dump, "another-password"),
            isRejectedWith(PersistedStorageImportRejection.INVALID_PASSWORD),
        );

        assert.equal(await countRecords(SIGNERS_DATA_KEY), 0);
    });

    test("import refuses a newer schema before the password is checked", async () => {
        await seedStorage();

        const dump: IPersistedStorageDump = await exportStorage();

        await clearTables(true);

        await assert.rejects(
            () =>
                importStorage(
                    { ...dump, schemaVersion: CURRENT_STORAGE_VERSION + 1 },
                    "another-password",
                ),
            isRejectedWith(PersistedStorageImportRejection.NEWER_SCHEMA),
        );
    });

    test("import refuses an unknown envelope type or version", async () => {
        await seedStorage();

        const dump: IPersistedStorageDump = await exportStorage();

        await clearTables(true);

        await assert.rejects(
            () => importStorage({ ...dump, type: "asi-wallet-keyfile" }),
            isRejectedWith(PersistedStorageImportRejection.UNKNOWN_ENVELOPE),
        );

        await assert.rejects(
            () =>
                importStorage({
                    ...dump,
                    version: PERSISTED_STORAGE_DUMP_VERSION + 1,
                }),
            isRejectedWith(PersistedStorageImportRejection.UNKNOWN_ENVELOPE),
        );

        await assert.rejects(
            () => importStorage("{not a json"),
            isRejectedWith(PersistedStorageImportRejection.INVALID_FORMAT),
        );
    });

    test("import rolls back written tables when a write fails", async () => {
        await seedStorage();

        const dump: IPersistedStorageDump = await exportStorage();

        await clearTables(true);

        const insertMany: ITableService<ITableRecord>["insertMany"] =
            storage.insertMany;

        storage.insertMany = async (
            tableName: string,
            records: ITableRecord[],
        ): Promise<void> => {
            if (tableName === ACCOUNTS_DATA_KEY) {
                throw new Error("disk is full");
            }

            await insertMany.call(storage, tableName, records);
        };

        try {
            await assert.rejects(
                () => importStorage(dump),
                (error: unknown) =>
                    error instanceof PersistedStorageImportError &&
                    error.isStorageIntact,
            );
        } finally {
            storage.insertMany = insertMany;
        }

        for (const tableName of [
            SIGNERS_DATA_KEY,
            ACCOUNTS_DATA_KEY,
            CUSTOM_NETWORKS_DATA_KEY,
            INSENSITIVE_CACHE_TABLE_KEY,
        ]) {
            assert.equal(await countRecords(tableName), 0, tableName);
        }
    });
};
