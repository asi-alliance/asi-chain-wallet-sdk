import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import Asset from "../../src/domains/Asset";
import Wallet, { Address } from "../../src/domains/Wallet";
import KeyDerivationService from "../../src/services/KeyDerivation";
import KeysManager from "../../src/services/KeysManager";
import MnemonicService from "../../src/services/Mnemonic";

const PASSWORD = "coverage-password";
const PRIVATE_KEY = Uint8Array.from([
    9, 8, 7, 6, 5, 4, 3, 2,
    1, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24,
    25, 26, 27, 28, 29, 30, 31, 32,
]);

afterEach(() => {
    Wallet.disableUnsafeRawKeyExport();
});

test("KeyDerivationService covers default path and mnemonic branches", async () => {
    const mnemonic = MnemonicService.generateMnemonic();
    const words = MnemonicService.mnemonicToWordArray(mnemonic);

    const seedFromString = await KeyDerivationService.mnemonicToSeed(
        mnemonic,
        "passphrase",
    );
    const seedFromArray = await KeyDerivationService.mnemonicToSeed(
        words,
        "passphrase",
    );

    assert.deepEqual(Array.from(seedFromArray), Array.from(seedFromString));

    const defaultPath = KeyDerivationService.buildBip44Path({} as any);
    assert.equal(defaultPath, "m/44'/60'/0'/0/0");

    const masterNode = KeyDerivationService.seedToMasterNode(seedFromString);
    const privateKey = KeyDerivationService.derivePrivateKey(
        masterNode,
        defaultPath,
    );
    assert.equal(privateKey.length, 32);

    const nextKey = await KeyDerivationService.deriveNextKeyFromMnemonic(
        words,
        0,
        { coinType: 60, account: 0, change: 0 },
    );
    assert.equal(nextKey.length, 32);
});

test("KeyDerivationService.derivePrivateKey throws when no key is present", () => {
    const fakeMasterNode = {
        derivePath: () => ({ privateKey: null }),
    } as any;

    assert.throws(
        () =>
            KeyDerivationService.derivePrivateKey(
                fakeMasterNode,
                "m/44'/60'/0'/0/0",
            ),
        /No private key at derived node/,
    );
});

test("KeysManager covers validation and utility branches", async () => {
    assert.throws(() => KeysManager.generateRandomKey(0), /positive integer/);
    assert.throws(() => KeysManager.generateRandomKey(-1), /positive integer/);
    assert.throws(() => KeysManager.generateRandomKey(1.5), /positive integer/);
    assert.throws(() => KeysManager.generateKeyPair(0), /positive integer/);
    assert.throws(() => KeysManager.generateMpcKeyPair(), /not implemented/);

    const randomKey = KeysManager.generateRandomKey(32);
    assert.equal(randomKey.length, 32);

    const pair = KeysManager.generateKeyPair(32);
    const pairFromPrivate = KeysManager.getKeyPairFromPrivateKey(
        pair.privateKey,
    );
    const publicKey = KeysManager.getPublicKeyFromPrivateKey(pair.privateKey);
    const privateHex = KeysManager.convertKeyToHex(pair.privateKey);

    assert.deepEqual(
        Array.from(pairFromPrivate.privateKey),
        Array.from(pair.privateKey),
    );
    assert.deepEqual(Array.from(pairFromPrivate.publicKey), Array.from(publicKey));
    assert.equal(privateHex.length, 64);

    const mnemonic = MnemonicService.generateMnemonic();
    const words = MnemonicService.mnemonicToWordArray(mnemonic);
    const derivedKey = await KeysManager.deriveKeyFromMnemonic(words, {
        coinType: 60,
        account: 0,
        change: 0,
        index: 0,
    });
    assert.equal(derivedKey.length, 32);
});

test("Wallet.fromEncryptedData validation and metadata paths are covered", async () => {
    const wallet = await Wallet.fromPrivateKey(
        "coverage-wallet",
        PRIVATE_KEY,
        PASSWORD,
        "master-node",
        7,
    );

    const restored = Wallet.fromEncryptedData(
        "coverage-wallet",
        wallet.getAddress(),
        wallet.getEncryptedPrivateKey(),
        "master-node",
        7,
    );

    assert.equal(restored.getName(), "coverage-wallet");
    assert.equal(restored.getAddress(), wallet.getAddress());
    assert.equal(restored.getIndex(), 7);
    assert.equal(restored.isWalletLocked(), true);

    restored.registerAsset(new Asset("ASI", "ASI", 8));
    assert.equal(restored.getAssets().size, 1);

    const serialized = JSON.parse(restored.toString());
    assert.equal(serialized.name, "coverage-wallet");
    assert.equal(serialized.masterNodeId, "master-node");

    assert.throws(
        () =>
            Wallet.fromEncryptedData(
                "bad-wallet",
                "1111short" as Address,
                wallet.getEncryptedPrivateKey(),
                null,
                null,
            ),
        /Invalid address format: INVALID_LENGTH/,
    );
});

test("Wallet unsafe export flag can be inspected", () => {
    Wallet.disableUnsafeRawKeyExport();
    assert.equal(Wallet.isUnsafeRawKeyExportEnabled(), false);

    Wallet.enableUnsafeRawKeyExportForLegacyInterop();
    assert.equal(Wallet.isUnsafeRawKeyExportEnabled(), true);
});
