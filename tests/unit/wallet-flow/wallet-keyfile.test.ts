import test from "node:test";
import assert from "node:assert/strict";

import { ASI_WALLET_KEYFILE, ASI_WALLET_KEYFILE_VERSION } from "@config/index";
import Account from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";
import Wallet from "@domains/Wallet";
import { WalletTypes } from "@domains/Signer";
import {
    DuplicateWalletError,
    InvalidKeyfileError,
    InvalidKeyfilePasswordError,
} from "@domains/CustomError";
import { SignersStorageRepository } from "@domains/SignersStorageRepository";
import { AccountsStorageRepository } from "@domains/AccountsStorageRepository";
import ExportKeyfileService, {
    IWalletKeyfile,
} from "@services/ExportKeyfileService";
import ImportKeyfileService from "@services/ImportKeyfileService";
import KeysManager from "@services/KeysManager";
import StorageManager from "@services/StorageManager";
import WalletManager from "@services/WalletManager";
import { encodeBase16 } from "@utils/codec";

const MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const PASSWORD = "12345678";

const WRONG_PASSWORD = "87654321";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/wallet-keyfile" };

const passwordProvider = new SecretsProvider(() => ({ password: PASSWORD }));

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

const importKeyfile = (
    walletManager: WalletManager,
    source: unknown,
    password: string = PASSWORD,
): Promise<Wallet> =>
    walletManager.importKeyfile(
        ImportKeyfileService.toImportPayload(
            ImportKeyfileService.parseWalletKeyfile(source),
        ),
        new SecretsProvider(() => ({ password })),
    );

const createHDWalletWithIndexGap = async (
    walletManager: WalletManager,
): Promise<Wallet> => {
    const wallet: Wallet = await walletManager.createHD(
        { mnemonic: MNEMONIC, accountName: "Main" },
        passwordProvider,
    );

    const { accountId } = await walletManager.deriveAccount(
        wallet.getId(),
        "Second",
        passwordProvider,
    );

    await walletManager.deriveAccount(wallet.getId(), "Third", passwordProvider);
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

    const keyfile: IWalletKeyfile =
        ExportKeyfileService.exportWalletKeyfile(wallet);

    const serialized: string = ExportKeyfileService.toJSON(keyfile);

    console.log("    Wallet type:", keyfile.walletType);
    console.log("    Accounts:", keyfile.accounts);

    assert.equal(keyfile.type, ASI_WALLET_KEYFILE);
    assert.equal(keyfile.version, ASI_WALLET_KEYFILE_VERSION);
    assert.equal(keyfile.walletType, WalletTypes.PRIVATE_KEY);
    assert.equal(keyfile.accounts.length, 1);
    assert.equal(keyfile.accounts[0].name, "Main");
    assert.equal(keyfile.accounts[0].index, null);
    assert.equal(
        keyfile.accounts[0].address,
        wallet.getActiveAccount()?.getAddress(),
    );
    assert.deepEqual(
        keyfile.encryptedPrivateData,
        wallet.getSigner().getEncryptedSecret(),
    );
    assert.equal(serialized.includes(encodeBase16(privateKey)), false);
});

test("hd keyfile keeps every account with its derivation index", async () => {
    console.log("\n=== HD KEYFILE EXPORT ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await createHDWalletWithIndexGap(walletManager);

    const keyfile: IWalletKeyfile =
        ExportKeyfileService.exportWalletKeyfile(wallet);

    const exportedIndexes: (number | null)[] = keyfile.accounts
        .map((account) => account.index)
        .sort((left, right) => (left ?? 0) - (right ?? 0));

    console.log("    Exported accounts:", keyfile.accounts);

    assert.equal(keyfile.walletType, WalletTypes.HD);
    assert.equal(keyfile.accounts.length, 2);
    assert.deepEqual(exportedIndexes, [0, 2]);
    assert.deepEqual(
        keyfile.accounts.map((account) => account.name).sort(),
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
        { mnemonic: MNEMONIC, accountName: "Main" },
        passwordProvider,
    );

    const account: Account = wallet.getAccounts()[0];

    const serialized: string = ExportKeyfileService.toJSON(
        ExportKeyfileService.exportAccountKeyfile(account),
    );

    console.log("    Account keyfile:", serialized);

    const parsed = JSON.parse(serialized);

    assert.equal(parsed.type, ASI_WALLET_KEYFILE);
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

    const keyfile: IWalletKeyfile =
        ExportKeyfileService.exportWalletKeyfile(wallet);

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

    const keyfile: IWalletKeyfile =
        ExportKeyfileService.exportWalletKeyfile(wallet);

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
        ExportKeyfileService.exportWalletKeyfile(wallet),
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

    const keyfile: IWalletKeyfile =
        ExportKeyfileService.exportWalletKeyfile(wallet);

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
        { mnemonic: MNEMONIC, accountName: "Main" },
        passwordProvider,
    );

    const keyfile: IWalletKeyfile =
        ExportKeyfileService.exportWalletKeyfile(wallet);

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
        { mnemonic: MNEMONIC, accountName: "Main" },
        passwordProvider,
    );

    const keyfile: IWalletKeyfile =
        ExportKeyfileService.exportWalletKeyfile(wallet);

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
        ["empty accounts", { ...keyfile, accounts: [] }],
        [
            "damaged account",
            { ...keyfile, accounts: [{ name: "Main", address: 1, index: 0 }] },
        ],
        [
            "private key keyfile with several accounts",
            {
                ...keyfile,
                walletType: WalletTypes.PRIVATE_KEY,
                accounts: [
                    { name: "First", address: "1111first", index: null },
                    { name: "Second", address: "1111second", index: null },
                ],
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

test("importing an already stored keyfile is rejected as a duplicate", async () => {
    console.log("\n=== DUPLICATE KEYFILE IMPORT ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createPrivateKey(
        "Main",
        createPkProvider(KeysManager.generateRandomKey()),
    );

    const keyfile: IWalletKeyfile =
        ExportKeyfileService.exportWalletKeyfile(wallet);

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