import assert from "node:assert/strict";
import test from "node:test";

import Bip44Path from "@domains/Bip44Path";
import SecretsProvider, {
    IHDSecret,
    IPrivateKeyCredentials,
} from "@domains/SecretsProvider";
import CryptoService from "@services/Crypto";
import KeysManager from "@services/KeysManager";
import { ASI_COIN_TYPE, PRIVATE_KEY_LENGTH } from "@utils/constants";
import MnemonicService from "@services/Mnemonic";

const PASSWORD = "key-management-password";
const WRONG_PASSWORD = "key-management-wrong-password";
const PAYLOAD = "sensitive-payload";
const SEED = MnemonicService.generateMnemonic();

const createPasswordProvider = (password: string): SecretsProvider =>
    new SecretsProvider(() => ({ password }));

const createRootHDPath = (): Bip44Path =>
    new Bip44Path({
        coinType: ASI_COIN_TYPE,
        account: 0,
        change: 0,
        index: 0,
    });

test("generateRandomKey rejects lengths that cannot produce a usable key", () => {
    assert.throws(() => KeysManager.generateRandomKey(0), /positive integer/);
    assert.throws(() => KeysManager.generateRandomKey(-1), /positive integer/);
    assert.throws(() => KeysManager.generateRandomKey(1.5), /positive integer/);
    assert.throws(() => KeysManager.generateKeyPair(0), /positive integer/);
});

test("generateRandomKey defaults to the configured private key length", () => {
    assert.equal(KeysManager.generateRandomKey().length, PRIVATE_KEY_LENGTH);
    assert.equal(
        KeysManager.generateKeyPair().privateKey.length,
        PRIVATE_KEY_LENGTH,
    );
});

test("generated keys are not repeated across calls", () => {
    const first = KeysManager.convertKeyToHex(KeysManager.generateRandomKey());
    const second = KeysManager.convertKeyToHex(KeysManager.generateRandomKey());

    assert.notEqual(first, second);
    assert.equal(first.length, PRIVATE_KEY_LENGTH * 2);
});

test("public key derivation from a private key is deterministic", () => {
    const pair = KeysManager.generateKeyPair();
    const restored = KeysManager.getKeyPairFromPrivateKey(pair.privateKey);
    const publicKey = KeysManager.getPublicKeyFromPrivateKey(pair.privateKey);

    assert.deepEqual(
        Array.from(restored.privateKey),
        Array.from(pair.privateKey),
    );
    assert.deepEqual(
        Array.from(restored.publicKey),
        Array.from(pair.publicKey),
    );
    assert.deepEqual(Array.from(publicKey), Array.from(pair.publicKey));
});

test("encrypting the same payload twice never repeats salt, iv or ciphertext", async () => {
    const first = await CryptoService.encryptWithPassword(PAYLOAD, PASSWORD);
    const second = await CryptoService.encryptWithPassword(PAYLOAD, PASSWORD);

    assert.notEqual(first.salt, second.salt);
    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.data, second.data);
});

test("generateDataKeySecret does not repeat itself", () => {
    assert.notEqual(
        CryptoService.generateDataKeySecret(),
        CryptoService.generateDataKeySecret(),
    );
});

test("decryptWithPassword round-trips only with the correct password", async () => {
    const encrypted = await CryptoService.encryptWithPassword(
        PAYLOAD,
        PASSWORD,
    );

    assert.equal(
        await CryptoService.decryptWithPassword(encrypted, PASSWORD),
        PAYLOAD,
    );

    await assert.rejects(
        CryptoService.decryptWithPassword(encrypted, WRONG_PASSWORD),
    );
});

test("decryptSignerData restores private key secrets as raw bytes", async () => {
    const privateKey = KeysManager.generateRandomKey();
    const encrypted = await CryptoService.encryptWithPassword(
        JSON.stringify({ privateKey: Array.from(privateKey) }),
        PASSWORD,
    );

    const secret = (await CryptoService.decryptSignerData(
        encrypted,
        createPasswordProvider(PASSWORD),
    )) as IPrivateKeyCredentials;

    assert.ok(secret.privateKey instanceof Uint8Array);
    assert.deepEqual(Array.from(secret.privateKey), Array.from(privateKey));
});

test("decryptSignerData restores hd secrets with a parsed derivation path", async () => {
    const rootHDPath = createRootHDPath();
    const encrypted = await CryptoService.encryptWithPassword(
        JSON.stringify({ seed: SEED, rootHDPath: rootHDPath.toString() }),
        PASSWORD,
    );

    const secret = (await CryptoService.decryptSignerData(
        encrypted,
        createPasswordProvider(PASSWORD),
    )) as IHDSecret;

    assert.equal(secret.seed, SEED);
    assert.ok(secret.rootHDPath instanceof Bip44Path);
    assert.equal(secret.rootHDPath.toString(), rootHDPath.toString());
});

test("decryptSignerData refuses a wrong password", async () => {
    const encrypted = await CryptoService.encryptWithPassword(
        JSON.stringify({
            privateKey: Array.from(KeysManager.generateRandomKey()),
        }),
        PASSWORD,
    );

    await assert.rejects(
        CryptoService.decryptSignerData(
            encrypted,
            createPasswordProvider(WRONG_PASSWORD),
        ),
    );
});
