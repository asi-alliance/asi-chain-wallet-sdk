import assert from "node:assert/strict";
import test from "node:test";
import { verify } from "@noble/secp256k1";

import Bip44Path from "@domains/Bip44Path";
import SecretsProvider, { IHDSecret } from "@domains/SecretsProvider";
import Signer, { WalletTypes } from "@domains/Signer";
import SigningSession from "@domains/SigningSession";
import KeyDerivationService from "@services/KeyDerivation";
import KeysManager from "@services/KeysManager";
import MnemonicService from "@services/Mnemonic";
import {
    WalletLockedError,
    WalletOperationCancelledError,
} from "@domains/CustomError";
import { createSigner } from "@fabrics/signer";
import { ASI_COIN_TYPE } from "@utils/constants";

const PASSWORD = "signing-session-password";
const WRONG_PASSWORD = "not-the-password";
const DATA_KEY = "data-key-secret";
const DIGEST = "11".repeat(32);
const KEY_LENGTH = 32;

const createPrivateKey = (fill: number): Uint8Array =>
    new Uint8Array(KEY_LENGTH).fill(fill);

const zeroedKey = (): number[] => new Array(KEY_LENGTH).fill(0);

const createPasswordProvider = (password: string): SecretsProvider =>
    new SecretsProvider(() => ({ password }));

const createPkSigner = (privateKey: Uint8Array): Promise<Signer> =>
    createSigner({
        id: "pk-signer",
        type: WalletTypes.PRIVATE_KEY,
        secretProvider: new SecretsProvider(() => ({
            password: PASSWORD,
            secret: { privateKey },
        })),
    });

const createRootHDPath = (): Bip44Path =>
    new Bip44Path({
        coinType: ASI_COIN_TYPE,
        account: 0,
        change: 0,
        index: 0,
    });

const createHdSigner = (
    mnemonic: string,
    rootHDPath: Bip44Path,
): Promise<Signer> =>
    createSigner({
        id: "hd-signer",
        type: WalletTypes.HD,
        secretProvider: new SecretsProvider(() => ({
            password: PASSWORD,
            secret: { rootHDPath: rootHDPath.toString(), seed: mnemonic },
        })),
    });

const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

test("release wipes held private key bytes in place", () => {
    const session = new SigningSession("signer-release");
    const privateKey = createPrivateKey(7);

    session.hold(session.getSessionGeneration(), {
        secret: { privateKey },
        dataKeySecret: DATA_KEY,
    });

    assert.equal(session.isActive(), true);

    session.release();

    assert.deepEqual(Array.from(privateKey), zeroedKey());
    assert.equal(session.isActive(), false);
    assert.equal(session.getSecret(), null);
    assert.equal(session.getDataKey(), null);
});

test("holding a new secret wipes the previously held one", () => {
    const session = new SigningSession("signer-rehold");
    const firstKey = createPrivateKey(1);
    const secondKey = createPrivateKey(2);

    session.hold(session.getSessionGeneration(), {
        secret: { privateKey: firstKey },
        dataKeySecret: DATA_KEY,
    });
    session.hold(session.getSessionGeneration(), {
        secret: { privateKey: secondKey },
        dataKeySecret: DATA_KEY,
    });

    assert.deepEqual(Array.from(firstKey), zeroedKey());
    assert.deepEqual(Array.from(secondKey), new Array(KEY_LENGTH).fill(2));
    assert.equal(session.getDataKey(), DATA_KEY);
});

test("hold rejects a stale generation and wipes the secret it was given", () => {
    const session = new SigningSession("signer-stale");
    const staleGeneration = session.getSessionGeneration();
    const privateKey = createPrivateKey(9);

    session.release();

    assert.throws(
        () =>
            session.hold(staleGeneration, {
                secret: { privateKey },
                dataKeySecret: DATA_KEY,
            }),
        WalletOperationCancelledError,
    );

    assert.deepEqual(Array.from(privateKey), zeroedKey());
    assert.equal(session.isActive(), false);
    assert.equal(session.getSecret(), null);
});

test("auto lock releases the session and wipes the key after the delay", async () => {
    const session = new SigningSession("signer-autolock");
    const privateKey = createPrivateKey(5);
    let autoLocked = false;

    session.hold(
        session.getSessionGeneration(),
        { secret: { privateKey }, dataKeySecret: DATA_KEY },
        {
            autoLockMs: 20,
            onAutoLock: () => {
                autoLocked = true;
            },
        },
    );

    assert.equal(session.isActive(), true);

    await wait(80);

    assert.equal(autoLocked, true);
    assert.equal(session.isActive(), false);
    assert.equal(session.getSecret(), null);
    assert.deepEqual(Array.from(privateKey), zeroedKey());
});

test("a session without an auto lock delay stays held", async () => {
    const session = new SigningSession("signer-no-autolock");

    session.hold(session.getSessionGeneration(), {
        secret: { privateKey: createPrivateKey(3) },
        dataKeySecret: DATA_KEY,
    });

    await wait(40);

    assert.equal(session.isActive(), true);

    session.release();
});

test("release accepts hd secrets that carry no wipeable key material", () => {
    const session = new SigningSession("signer-hd");
    const secret: IHDSecret = {
        seed: "test seed value",
        rootHDPath: createRootHDPath(),
    };

    session.hold(session.getSessionGeneration(), {
        secret,
        dataKeySecret: DATA_KEY,
    });

    session.release();

    assert.equal(session.isActive(), false);
    assert.equal(session.getSecret(), null);
});

test("a freshly created signer is locked and refuses to sign", async () => {
    const { privateKey } = KeysManager.generateKeyPair();
    const signer = await createPkSigner(privateKey);

    assert.equal(signer.isUnlocked(), false);

    await assert.rejects(signer.sign(DIGEST, {}), WalletLockedError);
    await assert.rejects(signer.resolveDataKey(), WalletLockedError);
});

test("isPasswordValid separates the correct password from a wrong one", async () => {
    const { privateKey } = KeysManager.generateKeyPair();
    const signer = await createPkSigner(privateKey);

    assert.equal(
        await signer.isPasswordValid(createPasswordProvider(WRONG_PASSWORD)),
        false,
    );
    assert.equal(
        await signer.isPasswordValid(createPasswordProvider(PASSWORD)),
        true,
    );
});

test("unlocking enables signing and locking disables it again", async () => {
    const { privateKey, publicKey } = KeysManager.generateKeyPair();
    const signer = await createPkSigner(privateKey);

    await signer.unlock(createPasswordProvider(PASSWORD));

    assert.equal(signer.isUnlocked(), true);

    const signed = await signer.sign(DIGEST, {});

    assert.deepEqual(Array.from(signed.publicKey), Array.from(publicKey));
    assert.equal(verify(signed.signature, DIGEST, signed.publicKey), true);

    signer.lock();

    assert.equal(signer.isUnlocked(), false);

    await assert.rejects(signer.sign(DIGEST, {}), WalletLockedError);
});

test("signing with an explicit password does not open a session", async () => {
    const { privateKey, publicKey } = KeysManager.generateKeyPair();
    const signer = await createPkSigner(privateKey);

    const signed = await signer.sign(DIGEST, {
        passwordProvider: createPasswordProvider(PASSWORD),
    });

    assert.deepEqual(Array.from(signed.publicKey), Array.from(publicKey));
    assert.equal(verify(signed.signature, DIGEST, signed.publicKey), true);
    assert.equal(signer.isUnlocked(), false);

    await assert.rejects(signer.sign(DIGEST, {}), WalletLockedError);
});

test("a locked hd signer refuses to sign", async () => {
    const signer = await createHdSigner(
        MnemonicService.generateMnemonic(),
        createRootHDPath(),
    );

    assert.equal(signer.isUnlocked(), false);

    await assert.rejects(signer.sign(DIGEST, { index: 0 }), WalletLockedError);
});

test("hd signer derives the key for the requested account index", async () => {
    const mnemonic = MnemonicService.generateMnemonic();
    const signer = await createHdSigner(mnemonic, createRootHDPath());

    await signer.unlock(createPasswordProvider(PASSWORD));

    const signed = await signer.sign(DIGEST, { index: 1 });

    const expectedKey = await KeyDerivationService.deriveKeyFromMnemonic(
        mnemonic,
        new Bip44Path({
            coinType: ASI_COIN_TYPE,
            account: 0,
            change: 0,
            index: 1,
        }),
    );

    assert.deepEqual(
        Array.from(signed.publicKey),
        Array.from(KeysManager.getPublicKeyFromPrivateKey(expectedKey)),
    );
    assert.equal(verify(signed.signature, DIGEST, signed.publicKey), true);
});

test("hd signer keeps account indexes on separate keys", async () => {
    const signer = await createHdSigner(
        MnemonicService.generateMnemonic(),
        createRootHDPath(),
    );

    await signer.unlock(createPasswordProvider(PASSWORD));

    const first = await signer.sign(DIGEST, { index: 0 });
    const second = await signer.sign(DIGEST, { index: 1 });

    assert.notDeepEqual(
        Array.from(second.publicKey),
        Array.from(first.publicKey),
    );
    assert.equal(verify(first.signature, DIGEST, first.publicKey), true);
    assert.equal(verify(second.signature, DIGEST, second.publicKey), true);
});