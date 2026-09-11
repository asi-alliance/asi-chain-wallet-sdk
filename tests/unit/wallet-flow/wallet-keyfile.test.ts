import test from "node:test";
import assert from "node:assert/strict";

import { ASI_WALLET_KEYFILE_VERSION, KeyfileTypes } from "@config/index";
import Account from "@domains/Account";
import Client from "@domains/Client";
import SecretsProvider from "@domains/SecretsProvider";
import Wallet from "@domains/Wallet";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { NetworkName, TNetworksConfig } from "@domains/Network";
import { WalletTypes } from "@domains/Signer";
import {
    DuplicateAccountError,
    DuplicateWalletError,
    InvalidKeyfileError,
    InvalidKeyfilePasswordError,
    KeyfileWalletNotFoundError,
} from "@domains/CustomError";
import { SignersStorageRepository } from "@domains/SignersStorageRepository";
import { AccountsStorageRepository } from "@domains/AccountsStorageRepository";
import CryptoService, { EncryptedData } from "@services/Crypto";
import ExportKeyfileService, {
    IWalletKeyfile,
} from "@services/ExportKeyfileService";
import ImportKeyfileService, {
    IImportWalletKeyfileOptions,
} from "@services/ImportKeyfileService";
import { IKeyfileWalletAccount } from "@services/KeyfileSerializer";
import KeysManager from "@services/KeysManager";
import StorageManager from "@services/StorageManager";
import WalletImportService, {
    IKeyfileAccountsImportPlan,
    IKeyfileAccountsImportResult,
    IKeyfileImportPreview,
    KeyfileImportAccountStatus,
} from "@services/WalletImport";
import WalletManager from "@services/WalletManager";
import WalletPersistenceService from "@services/WalletPersistence";
import { encodeBase16 } from "@utils/codec";
import MnemonicService from "@services/Mnemonic";

const MNEMONIC = MnemonicService.generateMnemonic();

const PASSWORD = "12345678";

const WRONG_PASSWORD = "87654321";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/wallet-keyfile" };

const NETWORK_NAME: NetworkName = "local";

const NETWORKS_CONFIG: TNetworksConfig = {
    [NETWORK_NAME]: {
        ValidatorURL: "http://localhost:40403",
        ReadOnlyURL: "http://localhost:40403",
        IndexerURL: "http://localhost:9090",
        nodeApiProfile: NodeApiProfile.RUST,
    },
};

const createClient = (): Promise<Client> =>
    Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: NETWORK_NAME,
        storageOptions: STORAGE_OPTIONS,
    });

const passwordProvider = new SecretsProvider(() => ({ password: PASSWORD }));

const hdSecretProvider = new SecretsProvider(() => ({
    password: PASSWORD,
    secret: { seed: MNEMONIC },
}));

const createPkProvider = (privateKey: Uint8Array): SecretsProvider =>
    new SecretsProvider(() => ({
        password: PASSWORD,
        secret: { privateKey },
    }));

interface IAccountSnapshot {
    name: string;
    index: number | null;
    address: string;
}

const snapshotAccounts = (wallet: Wallet): IAccountSnapshot[] =>
    wallet
        .getAccounts()
        .map((account: Account) => ({
            name: account.getName(),
            index: account.getIndex(),
            address: account.getAddress() as string,
        }))
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));

const exportKeyfile = (wallet: Wallet): Promise<IWalletKeyfile> =>
    ExportKeyfileService.exportWalletKeyfile(wallet, passwordProvider);

const readKeyfileAccounts = (
    keyfile: IWalletKeyfile,
): Promise<IKeyfileWalletAccount[]> =>
    ImportKeyfileService.decryptKeyfileAccounts(keyfile, passwordProvider);

const encryptKeyfileAccounts = (accounts: unknown): Promise<EncryptedData> =>
    CryptoService.encryptWithPassword(JSON.stringify(accounts), PASSWORD);

const importKeyfile = async (
    walletManager: WalletManager,
    source: unknown,
    password: string = PASSWORD,
    options?: IImportWalletKeyfileOptions,
): Promise<Wallet> => {
    const provider = new SecretsProvider(() => ({ password }));

    return walletManager.importKeyfile(
        await ImportKeyfileService.toImportPayload(
            ImportKeyfileService.parseWalletKeyfile(source),
            provider,
            options,
        ),
        provider,
    );
};

const previewKeyfileImport = (
    source: unknown,
): Promise<Omit<IKeyfileImportPreview, "isExistingWalletOpen">> =>
    WalletImportService.previewKeyfileImport(source, passwordProvider);

const createKeyfileAccounts = async (
    source: unknown,
    options?: IImportWalletKeyfileOptions,
): Promise<Account[]> => {
    const { payload, secretProvider, signerId }: IKeyfileAccountsImportPlan =
        await WalletImportService.prepareKeyfileAccountsImport(
            source,
            passwordProvider,
            options,
        );

    return WalletPersistenceService.createAccounts(
        signerId,
        payload.accounts,
        secretProvider,
    );
};

const accountIndexes = (accounts: Account[]): (number | null)[] =>
    accounts
        .map((account: Account) => account.getIndex())
        .sort((left, right) => (left ?? 0) - (right ?? 0));

const createHDWalletWithMissingAccount = async (
    walletManager: WalletManager,
): Promise<{ wallet: Wallet; keyfile: IWalletKeyfile }> => {
    const wallet: Wallet = await walletManager.createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const { accountId } = await walletManager.deriveAccount(
        wallet.getId(),
        "Second",
        passwordProvider,
    );

    await walletManager.deriveAccount(
        wallet.getId(),
        "Third",
        passwordProvider,
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    await walletManager.removeAccount(wallet.getId(), accountId);

    return { wallet, keyfile };
};

const createHDWalletWithIndexGap = async (
    walletManager: WalletManager,
): Promise<Wallet> => {
    const wallet: Wallet = await walletManager.createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const { accountId } = await walletManager.deriveAccount(
        wallet.getId(),
        "Second",
        passwordProvider,
    );

    await walletManager.deriveAccount(
        wallet.getId(),
        "Third",
        passwordProvider,
    );
    await walletManager.removeAccount(wallet.getId(), accountId);

    return wallet;
};

test.before(async () => {
    await StorageManager.init(STORAGE_OPTIONS);
});

test("private key keyfile carries the encrypted secret and a single account", async () => {
    console.log("\n=== PRIVATE KEY KEYFILE EXPORT ===");

    const walletManager = new WalletManager();
    const privateKey: Uint8Array = KeysManager.generateRandomKey();

    const wallet: Wallet = await walletManager.createPrivateKey(
        "Main",
        createPkProvider(privateKey),
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    const serialized: string = ExportKeyfileService.toJSON(keyfile);

    const accounts: IKeyfileWalletAccount[] =
        await readKeyfileAccounts(keyfile);

    console.log("    Wallet type:", keyfile.walletType);
    console.log("    Accounts:", accounts);

    assert.equal(keyfile.type, KeyfileTypes.WALLET);
    assert.equal(keyfile.version, ASI_WALLET_KEYFILE_VERSION);
    assert.equal(keyfile.walletType, WalletTypes.PRIVATE_KEY);
    assert.equal(accounts.length, 1);
    assert.deepEqual(accounts[0], { name: "Main", index: null });
    assert.deepEqual(
        keyfile.encryptedPrivateData,
        wallet.getSigner().getEncryptedSecret(),
    );
    assert.equal(serialized.includes(encodeBase16(privateKey)), false);
    assert.equal(serialized.includes("Main"), false);
    assert.equal(
        serialized.includes(wallet.getActiveAccount()?.getAddress() as string),
        false,
    );
});

test("hd keyfile keeps every account with its derivation index", async () => {
    console.log("\n=== HD KEYFILE EXPORT ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await createHDWalletWithIndexGap(walletManager);

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    const accounts: IKeyfileWalletAccount[] =
        await readKeyfileAccounts(keyfile);

    const exportedIndexes: (number | null)[] = accounts
        .map((account: IKeyfileWalletAccount) => account.index)
        .sort((left, right) => (left ?? 0) - (right ?? 0));

    console.log("    Exported accounts:", accounts);

    assert.equal(keyfile.walletType, WalletTypes.HD);
    assert.equal(accounts.length, 2);
    assert.deepEqual(exportedIndexes, [0, 2]);
    assert.deepEqual(
        accounts.map((account: IKeyfileWalletAccount) => account.name).sort(),
        ["Main", "Third"],
    );
    assert.equal(
        ExportKeyfileService.toJSON(keyfile).includes(MNEMONIC),
        false,
    );
});

test("account keyfile exports metadata without any secret", async () => {
    console.log("\n=== ACCOUNT KEYFILE EXPORT ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const account: Account = wallet.getAccounts()[0];

    const serialized: string = ExportKeyfileService.toJSON(
        ExportKeyfileService.exportAccountKeyfile(account),
    );

    console.log("    Account keyfile:", serialized);

    const parsed = JSON.parse(serialized);

    assert.equal(parsed.type, KeyfileTypes.ACCOUNT);
    assert.deepEqual(parsed.account, {
        name: "Main",
        address: account.getAddress(),
        index: 0,
    });
    assert.equal("encryptedPrivateData" in parsed, false);
    assert.equal("walletType" in parsed, false);
    assert.equal(serialized.includes(MNEMONIC), false);
});

test("private key keyfile round trip restores the same address", async () => {
    console.log("\n=== PRIVATE KEY KEYFILE ROUND TRIP ===");

    const walletManager = new WalletManager();
    const privateKey: Uint8Array = KeysManager.generateRandomKey();

    const wallet: Wallet = await walletManager.createPrivateKey(
        "Main",
        createPkProvider(privateKey),
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    const originalAccounts: IAccountSnapshot[] = snapshotAccounts(wallet);
    const originalFingerprint: string = wallet.getSigner().getFingerprint();
    const originalSignerId: string = wallet.getSigner().getId();

    await walletManager.delete(wallet.getId());

    const imported: Wallet = await importKeyfile(walletManager, keyfile);

    console.log("    Original accounts:", originalAccounts);
    console.log("    Imported accounts:", snapshotAccounts(imported));

    assert.equal(imported.getType(), WalletTypes.PRIVATE_KEY);
    assert.deepEqual(snapshotAccounts(imported), originalAccounts);
    assert.equal(imported.getSigner().getFingerprint(), originalFingerprint);
    assert.notEqual(imported.getSigner().getId(), originalSignerId);
    assert.equal(
        imported.getActiveAccount()?.getAddress(),
        originalAccounts[0].address,
    );
    assert.equal((await StorageManager.getSigners()).length, 1);
    assert.equal((await StorageManager.getAccounts()).length, 1);
});

test("hd keyfile round trip restores every account and keeps the index gap derivable", async () => {
    console.log("\n=== HD KEYFILE ROUND TRIP ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await createHDWalletWithIndexGap(walletManager);

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    const originalAccounts: IAccountSnapshot[] = snapshotAccounts(wallet);

    await walletManager.delete(wallet.getId());

    const imported: Wallet = await importKeyfile(walletManager, keyfile);

    console.log("    Original accounts:", originalAccounts);
    console.log("    Imported accounts:", snapshotAccounts(imported));

    assert.equal(imported.getType(), WalletTypes.HD);
    assert.deepEqual(snapshotAccounts(imported), originalAccounts);
    assert.equal((await StorageManager.getAccounts()).length, 2);

    const { account } = await walletManager.deriveAccount(
        imported.getId(),
        "Filler",
        passwordProvider,
    );

    console.log("    Derived after import:", {
        index: account.getIndex(),
        address: account.getAddress(),
    });

    assert.equal(account.getIndex(), 1);
});

test("keyfile exported as JSON can be imported back", async () => {
    console.log("\n=== JSON KEYFILE IMPORT ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createPrivateKey(
        "Main",
        createPkProvider(KeysManager.generateRandomKey()),
    );

    const serialized: string = ExportKeyfileService.toJSON(
        await exportKeyfile(wallet),
    );

    const originalAccounts: IAccountSnapshot[] = snapshotAccounts(wallet);

    await walletManager.delete(wallet.getId());

    const imported: Wallet = await importKeyfile(walletManager, serialized);

    assert.deepEqual(snapshotAccounts(imported), originalAccounts);
});

test("import fails with a wrong password", async () => {
    console.log("\n=== WRONG KEYFILE PASSWORD ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createPrivateKey(
        "Main",
        createPkProvider(KeysManager.generateRandomKey()),
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    await walletManager.delete(wallet.getId());

    await assert.rejects(
        () => importKeyfile(walletManager, keyfile, WRONG_PASSWORD),
        InvalidKeyfilePasswordError,
    );

    assert.equal((await StorageManager.getSigners()).length, 0);
    assert.equal(walletManager.getAll().length, 0);
});

test("import rejects a keyfile whose secret does not match its wallet type", async () => {
    console.log("\n=== KEYFILE WALLET TYPE MISMATCH ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    await walletManager.delete(wallet.getId());

    await assert.rejects(
        () =>
            importKeyfile(walletManager, {
                ...keyfile,
                walletType: WalletTypes.PRIVATE_KEY,
            }),
        (error: Error) =>
            error instanceof InvalidKeyfileError &&
            /does not match its wallet type/.test(error.message),
    );
});

test("import rejects malformed keyfiles", async () => {
    console.log("\n=== MALFORMED KEYFILES ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    const malformedKeyfiles: [string, unknown][] = [
        ["null source", null],
        ["broken json", "{ not a json"],
        ["foreign type", { ...keyfile, type: "other-wallet-keyfile" }],
        ["unsupported version", { ...keyfile, version: 999 }],
        ["unknown wallet type", { ...keyfile, walletType: "ledger" }],
        ["missing secret", { ...keyfile, encryptedPrivateData: undefined }],
        [
            "damaged secret",
            {
                ...keyfile,
                encryptedPrivateData: {
                    ...keyfile.encryptedPrivateData,
                    iv: 42,
                },
            },
        ],
        ["missing accounts", { ...keyfile, encryptedAccounts: undefined }],
        [
            "damaged accounts",
            {
                ...keyfile,
                encryptedAccounts: {
                    ...keyfile.encryptedAccounts,
                    iv: 42,
                },
            },
        ],
    ];

    for (const [reason, source] of malformedKeyfiles) {
        console.log("    Rejecting:", reason);

        assert.throws(
            () => ImportKeyfileService.parseWalletKeyfile(source),
            InvalidKeyfileError,
            reason,
        );
    }

    assert.doesNotThrow(() => ImportKeyfileService.parseWalletKeyfile(keyfile));
});

test("import rejects malformed keyfile accounts", async () => {
    console.log("\n=== MALFORMED KEYFILE ACCOUNTS ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    const malformedAccounts: [string, WalletTypes, unknown][] = [
        ["empty accounts", WalletTypes.HD, []],
        ["damaged account", WalletTypes.HD, [{ name: 1, index: 0 }]],
        [
            "duplicate account indexes",
            WalletTypes.HD,
            [
                { name: "First", index: 0 },
                { name: "Second", index: 0 },
            ],
        ],
        [
            "private key keyfile with several accounts",
            WalletTypes.PRIVATE_KEY,
            [
                { name: "First", index: null },
                { name: "Second", index: null },
            ],
        ],
    ];

    for (const [reason, walletType, accounts] of malformedAccounts) {
        const encryptedAccounts: EncryptedData =
            await encryptKeyfileAccounts(accounts);

        console.log("    Rejecting:", reason);

        await assert.rejects(
            () =>
                ImportKeyfileService.decryptKeyfileAccounts(
                    { ...keyfile, walletType, encryptedAccounts },
                    passwordProvider,
                ),
            InvalidKeyfileError,
            reason,
        );
    }
});

test("import preview lists every account of a wallet that is not stored yet", async () => {
    console.log("\n=== KEYFILE IMPORT PREVIEW ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await createHDWalletWithIndexGap(walletManager);

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    const originalAccounts: IAccountSnapshot[] = snapshotAccounts(wallet);

    await walletManager.delete(wallet.getId());

    const preview = await previewKeyfileImport(keyfile);

    console.log("    Preview accounts:", preview.accounts);

    assert.equal(preview.walletType, WalletTypes.HD);
    assert.equal(preview.existingSignerId, null);
    assert.deepEqual(
        preview.accounts.map(({ index }) => index),
        originalAccounts.map(({ index }) => index),
    );
    assert.deepEqual(
        preview.accounts.map(({ address }) => address),
        originalAccounts.map(({ address }) => address),
    );
    assert.deepEqual(
        preview.accounts.map(({ status }) => status),
        originalAccounts.map(() => KeyfileImportAccountStatus.NEW),
    );
    assert.deepEqual(
        preview.accounts.map(({ existingAccountId }) => existingAccountId),
        originalAccounts.map(() => null),
    );
});

test("import preview points to the stored wallet and marks imported accounts", async () => {
    console.log("\n=== KEYFILE IMPORT PREVIEW FOR A STORED WALLET ===");

    const walletManager = new WalletManager();

    const { wallet, keyfile } =
        await createHDWalletWithMissingAccount(walletManager);

    const preview = await previewKeyfileImport(keyfile);

    console.log("    Preview accounts:", preview.accounts);

    const statusByIndex = new Map(
        preview.accounts.map(({ index, status }) => [index, status]),
    );

    assert.equal(preview.existingSignerId, wallet.getSigner().getId());
    assert.equal(preview.accounts.length, 3);
    assert.equal(
        statusByIndex.get(0),
        KeyfileImportAccountStatus.ALREADY_IMPORTED,
    );
    assert.equal(statusByIndex.get(1), KeyfileImportAccountStatus.NEW);
    assert.equal(
        statusByIndex.get(2),
        KeyfileImportAccountStatus.ALREADY_IMPORTED,
    );
});

test("import preview rejects a private key keyfile that is already stored", async () => {
    console.log("\n=== KEYFILE IMPORT PREVIEW FOR A STORED PK WALLET ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createPrivateKey(
        "Main",
        createPkProvider(KeysManager.generateRandomKey()),
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    await assert.rejects(
        () => previewKeyfileImport(keyfile),
        DuplicateWalletError,
    );
});

test("selected keyfile accounts are saved for the stored wallet", async () => {
    console.log("\n=== KEYFILE ACCOUNTS IMPORT ===");

    const walletManager = new WalletManager();

    const { keyfile } = await createHDWalletWithMissingAccount(walletManager);

    const importedAccounts: Account[] = await createKeyfileAccounts(keyfile, {
        accountIndexes: [1],
    });

    console.log(
        "    Imported account indexes:",
        accountIndexes(importedAccounts),
    );

    assert.equal(importedAccounts.length, 1);
    assert.equal(importedAccounts[0].getIndex(), 1);
    assert.equal(importedAccounts[0].getName(), "Second");
    assert.equal((await StorageManager.getSigners()).length, 1);
    assert.equal((await StorageManager.getAccounts()).length, 3);
});

test("importing an already imported account is rejected as a duplicate", async () => {
    console.log("\n=== DUPLICATE KEYFILE ACCOUNT IMPORT ===");

    const walletManager = new WalletManager();

    const { wallet, keyfile } =
        await createHDWalletWithMissingAccount(walletManager);

    await assert.rejects(
        () => createKeyfileAccounts(keyfile, { accountIndexes: [0] }),
        DuplicateAccountError,
    );

    assert.deepEqual(accountIndexes(wallet.getAccounts()), [0, 2]);
    assert.equal((await StorageManager.getAccounts()).length, 2);
});

test("accounts import is rejected when the keyfile has no stored wallet", async () => {
    console.log("\n=== KEYFILE ACCOUNTS IMPORT WITHOUT A STORED WALLET ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await createHDWalletWithIndexGap(walletManager);

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    await walletManager.delete(wallet.getId());

    await assert.rejects(
        () => createKeyfileAccounts(keyfile, { accountIndexes: [2] }),
        KeyfileWalletNotFoundError,
    );

    assert.equal((await StorageManager.getAccounts()).length, 0);
});

test("import rejects account indexes that are missing in the keyfile", async () => {
    console.log("\n=== UNKNOWN KEYFILE ACCOUNT INDEXES ===");

    const walletManager = new WalletManager();

    const { keyfile } = await createHDWalletWithMissingAccount(walletManager);

    await assert.rejects(
        () => createKeyfileAccounts(keyfile, { accountIndexes: [7] }),
        (error: Error) =>
            error instanceof InvalidKeyfileError &&
            /indexes 7/.test(error.message),
    );

    await assert.rejects(
        () => createKeyfileAccounts(keyfile, { accountIndexes: [] }),
        InvalidKeyfileError,
    );
});

test("keyfile accounts are imported into an open and into a closed wallet", async () => {
    console.log("\n=== KEYFILE ACCOUNTS IMPORT THROUGH THE CLIENT ===");

    const client: Client = await createClient();

    const exportedWallet: Wallet = await client.createHDWallet(
        { mnemonic: MNEMONIC, accountName: "Main" },
        PASSWORD,
    );

    await client.deriveAccount(exportedWallet.getId(), "Second", PASSWORD);
    await client.deriveAccount(exportedWallet.getId(), "Third", PASSWORD);

    const keyfile: string = ExportKeyfileService.toJSON(
        await client.exportWalletKeyfile(exportedWallet.getId(), PASSWORD),
    );

    await client.clearPersistence();

    await assert.rejects(
        () => client.importKeyfileAccounts(keyfile, PASSWORD),
        KeyfileWalletNotFoundError,
    );

    const storedWallet: Wallet = await client.createHDWallet(
        { mnemonic: MNEMONIC, accountName: "Main" },
        WRONG_PASSWORD,
    );

    const storedSignerId: string = storedWallet.getSigner().getId();

    await assert.rejects(
        () => client.importWalletKeyfile(keyfile, PASSWORD),
        DuplicateWalletError,
    );

    const openWalletPreview: IKeyfileImportPreview =
        await client.previewWalletKeyfileImport(keyfile, PASSWORD);

    assert.equal(openWalletPreview.existingSignerId, storedSignerId);
    assert.equal(openWalletPreview.isExistingWalletOpen, true);

    const openWalletImport: IKeyfileAccountsImportResult =
        await client.importKeyfileAccounts(keyfile, PASSWORD, {
            accountIndexes: [2],
        });

    console.log("    Open wallet accounts:", snapshotAccounts(storedWallet));

    assert.equal(openWalletImport.signerId, storedSignerId);
    assert.equal(openWalletImport.importedAccountIds.length, 1);
    assert.deepEqual(accountIndexes(storedWallet.getAccounts()), [0, 2]);

    client.closeWallet(storedWallet.getId());

    const closedWalletPreview: IKeyfileImportPreview =
        await client.previewWalletKeyfileImport(keyfile, PASSWORD);

    assert.equal(closedWalletPreview.existingSignerId, storedSignerId);
    assert.equal(closedWalletPreview.isExistingWalletOpen, false);

    const closedWalletImport: IKeyfileAccountsImportResult =
        await client.importKeyfileAccounts(keyfile, PASSWORD, {
            accountIndexes: [1],
        });

    console.log(
        "    Imported account ids:",
        closedWalletImport.importedAccountIds,
    );

    assert.equal(closedWalletImport.signerId, storedSignerId);
    assert.equal(closedWalletImport.importedAccountIds.length, 1);
    assert.equal(client.getWalletManager().getBySignerId(storedSignerId), null);
    assert.equal((await StorageManager.getSigners()).length, 1);
    assert.equal((await StorageManager.getAccounts()).length, 3);

    const reopenedWallet: Wallet = await client.openWallet(
        storedSignerId,
        WRONG_PASSWORD,
    );

    console.log("    Reopened accounts:", snapshotAccounts(reopenedWallet));

    assert.deepEqual(accountIndexes(reopenedWallet.getAccounts()), [0, 1, 2]);

    client.lockWallet(reopenedWallet.getId());
});

test("only selected accounts are imported for a wallet that is not stored yet", async () => {
    console.log("\n=== SELECTED ACCOUNTS IMPORT ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await createHDWalletWithIndexGap(walletManager);

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    await walletManager.delete(wallet.getId());

    const imported: Wallet = await importKeyfile(
        walletManager,
        keyfile,
        PASSWORD,
        { accountIndexes: [2] },
    );

    console.log("    Imported accounts:", snapshotAccounts(imported));

    assert.deepEqual(accountIndexes(imported.getAccounts()), [2]);
    assert.equal((await StorageManager.getAccounts()).length, 1);
});

test("importing an already stored keyfile is rejected as a duplicate", async () => {
    console.log("\n=== DUPLICATE KEYFILE IMPORT ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createPrivateKey(
        "Main",
        createPkProvider(KeysManager.generateRandomKey()),
    );

    const keyfile: IWalletKeyfile = await exportKeyfile(wallet);

    await assert.rejects(
        () => importKeyfile(walletManager, keyfile),
        DuplicateWalletError,
    );

    assert.equal((await StorageManager.getSigners()).length, 1);
    assert.equal((await StorageManager.getAccounts()).length, 1);
});

test.afterEach(async () => {
    await SignersStorageRepository.getInstance().clearAllData();
    await AccountsStorageRepository.getInstance().clearAllData();
});
