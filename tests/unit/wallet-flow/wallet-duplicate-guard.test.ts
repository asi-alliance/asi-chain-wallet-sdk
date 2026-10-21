import test from "node:test";
import assert from "node:assert/strict";

import WalletManager from "@services/WalletManager";
import StorageManager from "@services/StorageManager";
import KeysManager from "@services/KeysManager";
import KeyDerivationService from "@services/KeyDerivation";
import KeyFingerprintService from "@services/KeyFingerprint";
import SecretsProvider from "@domains/SecretsProvider";
import Wallet from "@domains/Wallet";
import Bip44Path from "@domains/Bip44Path";
import { SignersStorageRepository } from "@domains/SignersStorageRepository";
import { AccountsStorageRepository } from "@domains/AccountsStorageRepository";
import {
    DuplicateAccountError,
    DuplicateWalletError,
    InvalidPasswordError,
    WalletAction,
    WalletActionInProgressError,
} from "@domains/CustomError";
import MnemonicService from "@services/Mnemonic";
import { ASI_COIN_TYPE } from "@utils/constants";

const MNEMONIC = MnemonicService.generateMnemonic();

const PASSWORD = "12345678";

const WRONG_PASSWORD = "87654321";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/wallet-duplicate-guard" };

const passwordProvider = new SecretsProvider(() => ({ password: PASSWORD }));

const wrongPasswordProvider = new SecretsProvider(() => ({
    password: WRONG_PASSWORD,
}));

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

const storeLegacyFingerprint = async (wallet: Wallet): Promise<string> => {
    const legacyFingerprint: string =
        await KeyFingerprintService.fromMnemonic(MNEMONIC);

    await StorageManager.updateSigner(wallet.getSigner().getId(), {
        fingerprint: legacyFingerprint,
    });

    return legacyFingerprint;
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

test("HD fingerprints depend on the root HD path but not on the account index", async () => {
    console.log("\n=== HD FINGERPRINT BY ROOT HD PATH ===");

    const createPath = (account: number, index: number): Bip44Path =>
        new Bip44Path({ coinType: ASI_COIN_TYPE, account, change: 0, index });

    const defaultPath: string = await KeyFingerprintService.fromHDSecret(
        MNEMONIC,
        createPath(0, 0),
    );
    const otherIndex: string = await KeyFingerprintService.fromHDSecret(
        MNEMONIC,
        createPath(0, 5),
    );
    const otherAccount: string = await KeyFingerprintService.fromHDSecret(
        MNEMONIC,
        createPath(1, 0),
    );

    assert.equal(otherIndex, defaultPath);
    assert.notEqual(otherAccount, defaultPath);
});

test("a legacy HD fingerprint still rejects a second wallet with the same mnemonic", async () => {
    console.log("\n=== LEGACY HD FINGERPRINT DUPLICATE ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createHD(
        { accountName: "First" },
        hdSecretProvider,
    );

    await storeLegacyFingerprint(wallet);

    await assert.rejects(
        () =>
            new WalletManager().createHD(
                { accountName: "Second" },
                hdSecretProvider,
            ),
        DuplicateWalletError,
    );

    assert.equal((await StorageManager.getSigners()).length, 1);
});

test("opening a legacy HD wallet upgrades its stored fingerprint", async () => {
    console.log("\n=== LEGACY HD FINGERPRINT UPGRADE ===");

    const wallet: Wallet = await new WalletManager().createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const signerId: string = wallet.getSigner().getId();
    const legacyFingerprint: string = await storeLegacyFingerprint(wallet);

    const opened: Wallet = await new WalletManager().open(
        signerId,
        passwordProvider,
    );

    const { fingerprint } = await StorageManager.getSigner(signerId);

    console.log("    Stored fingerprint upgraded:", fingerprint !== legacyFingerprint);

    assert.equal(fingerprint, wallet.getSigner().getFingerprint());
    assert.equal(opened.getSigner().getFingerprint(), fingerprint);
});

test("a failed open with a wrong password keeps the legacy HD fingerprint", async () => {
    console.log("\n=== LEGACY HD FINGERPRINT AND A WRONG PASSWORD ===");

    const wallet: Wallet = await new WalletManager().createHD(
        { accountName: "Main" },
        hdSecretProvider,
    );

    const signerId: string = wallet.getSigner().getId();
    const legacyFingerprint: string = await storeLegacyFingerprint(wallet);

    const walletManager = new WalletManager();

    await assert.rejects(
        () => walletManager.open(signerId, wrongPasswordProvider),
        InvalidPasswordError,
    );

    const { fingerprint: storedAfterFailure } =
        await StorageManager.getSigner(signerId);

    console.log(
        "    Legacy fingerprint kept after the failure:",
        storedAfterFailure === legacyFingerprint,
    );

    assert.equal(storedAfterFailure, legacyFingerprint);
    assert.equal(walletManager.getAll().length, 0);

    await walletManager.open(signerId, passwordProvider);

    assert.equal(
        (await StorageManager.getSigner(signerId)).fingerprint,
        wallet.getSigner().getFingerprint(),
    );
});

test("a legacy HD wallet without its first account is matched by its lowest account index", async () => {
    console.log("\n=== LEGACY HD FINGERPRINT WITHOUT THE FIRST ACCOUNT ===");

    const walletManager = new WalletManager();

    const wallet: Wallet = await walletManager.createHD(
        { accountName: "First" },
        hdSecretProvider,
    );

    const [firstAccount] = wallet.getAccounts();

    await walletManager.deriveAccount(wallet.getId(), "Second", passwordProvider);
    await walletManager.deriveAccount(wallet.getId(), "Third", passwordProvider);
    await walletManager.removeAccount(wallet.getId(), firstAccount.getId());

    await storeLegacyFingerprint(wallet);

    const storedIndexes = (await StorageManager.getAccounts())
        .map((account) => account.index)
        .sort((a, b) => a! - b!);

    console.log("    Stored account indexes:", storedIndexes);

    assert.deepEqual(storedIndexes, [1, 2]);

    await assert.rejects(
        () =>
            new WalletManager().createHD(
                { accountName: "Duplicate" },
                hdSecretProvider,
            ),
        DuplicateWalletError,
    );

    assert.equal((await StorageManager.getSigners()).length, 1);
});

test.afterEach(async () => {
    await SignersStorageRepository.getInstance().clearAllData();
    await AccountsStorageRepository.getInstance().clearAllData();
});
