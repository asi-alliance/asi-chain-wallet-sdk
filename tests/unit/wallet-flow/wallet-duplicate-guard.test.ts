import test from "node:test";
import assert from "node:assert/strict";

import WalletManager from "@services/WalletManager";
import StorageManager from "@services/StorageManager";
import KeysManager from "@services/KeysManager";
import KeyDerivationService from "@services/KeyDerivation";
import SecretsProvider from "@domains/SecretsProvider";
import Wallet from "@domains/Wallet";
import Bip44Path from "@domains/Bip44Path";
import { SignersStorageRepository } from "@domains/SignersStorageRepository";
import { AccountsStorageRepository } from "@domains/AccountsStorageRepository";
import {
    DuplicateAccountError,
    DuplicateWalletError,
    WalletAction,
    WalletActionInProgressError,
} from "@domains/CustomError";

const MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const PASSWORD = "12345678";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/wallet-duplicate-guard" };

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

interface ISettledOperations<T> {
    fulfilled: T[];
    errors: Error[];
}

const settleAll = async <T>(
    operations: Promise<T>[],
): Promise<ISettledOperations<T>> => {
    const results: PromiseSettledResult<T>[] =
        await Promise.allSettled(operations);

    const summary: ISettledOperations<T> = {
        fulfilled: results
            .filter(
                (result): result is PromiseFulfilledResult<T> =>
                    result.status === "fulfilled",
            )
            .map((result: PromiseFulfilledResult<T>) => result.value),
        errors: results
            .filter(
                (result): result is PromiseRejectedResult =>
                    result.status === "rejected",
            )
            .map((result: PromiseRejectedResult) => result.reason as Error),
    };

    console.log("    Fulfilled:", summary.fulfilled.length);
    console.log(
        "    Rejected:",
        summary.errors.map((error: Error) => error.name),
    );

    return summary;
};

test.before(async () => {
    await StorageManager.init(STORAGE_OPTIONS);
});

test("concurrent private key import keeps a single wallet", async () => {
    console.log("\n=== CONCURRENT PRIVATE KEY IMPORT ===");

    const walletManager = new WalletManager();
    const privateKey: Uint8Array = KeysManager.generateRandomKey();

    const { fulfilled, errors } = await settleAll([
        walletManager.createPrivateKey("First", createPkProvider(privateKey)),
        walletManager.createPrivateKey("Second", createPkProvider(privateKey)),
    ]);

    const signers = await StorageManager.getSigners();
    const accounts = await StorageManager.getAccounts();

    console.log("    Signers in storage:", signers.length);
    console.log("    Accounts in storage:", accounts.length);

    assert.equal(fulfilled.length, 1);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof DuplicateWalletError);
    assert.equal(signers.length, 1);
    assert.equal(accounts.length, 1);
    assert.equal(walletManager.getAll().length, 1);
});

test("concurrent HD creation with the same mnemonic keeps a single wallet", async () => {
    console.log("\n=== CONCURRENT HD CREATION ===");

    const walletManager = new WalletManager();

    const { fulfilled, errors } = await settleAll([
        walletManager.createHD({ accountName: "First" }, hdSecretProvider),
        walletManager.createHD({ accountName: "Second" }, hdSecretProvider),
    ]);

    const signers = await StorageManager.getSigners();

    console.log("    Signers in storage:", signers.length);

    assert.equal(fulfilled.length, 1);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof DuplicateWalletError);
    assert.equal(signers.length, 1);
    assert.equal(walletManager.getAll().length, 1);
});

test("concurrent HD creation and import of its derived key keep a single wallet", async () => {
    console.log("\n=== CONCURRENT HD CREATION AND DERIVED KEY IMPORT ===");

    const walletManager = new WalletManager();

    const rootHDPath: Bip44Path = await KeysManager.getInitialHDPathFromOptions(
        {
            index: 0,
        },
    );

    const privateKey: Uint8Array =
        await KeyDerivationService.deriveKeyFromMnemonic(MNEMONIC, rootHDPath);

    const { fulfilled, errors } = await settleAll<Wallet>([
        walletManager.createHD({ accountName: "Derived" }, hdSecretProvider),
        walletManager.createPrivateKey(
            "Imported",
            createPkProvider(privateKey),
        ),
    ]);

    const accounts = await StorageManager.getAccounts();

    console.log("    Accounts in storage:", accounts.length);

    assert.equal(fulfilled.length, 1);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof DuplicateAccountError);
    assert.equal(accounts.length, 1);
});

test("concurrent open of the same signer keeps a single wallet", async () => {
    console.log("\n=== CONCURRENT OPEN ===");

    const creator = new WalletManager();

    const created: Wallet = await creator.createPrivateKey(
        "Main",
        createPkProvider(KeysManager.generateRandomKey()),
    );

    const signerId: string = created.getSigner().getId();

    const walletManager = new WalletManager();

    const { fulfilled, errors } = await settleAll([
        walletManager.open(signerId, passwordProvider),
        walletManager.open(signerId, passwordProvider),
    ]);

    console.log("    Wallets in manager:", walletManager.getAll().length);

    assert.equal(fulfilled.length, 1);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof WalletActionInProgressError);
    assert.equal(
        (errors[0] as WalletActionInProgressError).action,
        WalletAction.OPEN,
    );
    assert.equal(walletManager.getAll().length, 1);
});

test("concurrent account derivation adds a single account", async () => {
    console.log("\n=== CONCURRENT ACCOUNT DERIVATION ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const { fulfilled, errors } = await settleAll([
        walletManager.deriveAccount(wallet.getId(), "Second", passwordProvider),
        walletManager.deriveAccount(wallet.getId(), "Third", passwordProvider),
    ]);

    const indexes = wallet
        .getAccounts()
        .map((account) => account.getIndex())
        .sort((a, b) => a! - b!);

    const accounts = await StorageManager.getAccounts();

    console.log("    Derivation indexes:", indexes);
    console.log("    Accounts in storage:", accounts.length);

    assert.equal(fulfilled.length, 1);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof WalletActionInProgressError);
    assert.equal(
        (errors[0] as WalletActionInProgressError).action,
        WalletAction.DERIVE_ACCOUNT,
    );
    assert.deepEqual(indexes, [0, 1]);
    assert.equal(accounts.length, 2);
});

test("sequential duplicate import is still rejected by the storage check", async () => {
    console.log("\n=== SEQUENTIAL DUPLICATE IMPORT ===");

    const walletManager = new WalletManager();
    const privateKey: Uint8Array = KeysManager.generateRandomKey();

    await walletManager.createPrivateKey("First", createPkProvider(privateKey));

    await assert.rejects(
        () =>
            walletManager.createPrivateKey(
                "Second",
                createPkProvider(privateKey),
            ),
        DuplicateWalletError,
    );

    const signers = await StorageManager.getSigners();

    console.log("    Signers in storage:", signers.length);

    assert.equal(signers.length, 1);
});

test.afterEach(async () => {
    await SignersStorageRepository.getInstance().clearAllData();
    await AccountsStorageRepository.getInstance().clearAllData();
});
