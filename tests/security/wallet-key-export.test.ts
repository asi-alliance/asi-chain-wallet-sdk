import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { verify } from "@noble/secp256k1";

import Wallet, { SigningCapability } from "../../src/domains/Wallet";

const PASSWORD = "wallet-password";
const PRIVATE_KEY = Uint8Array.from([
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24,
    25, 26, 27, 28, 29, 30, 31, 32,
]);

afterEach(() => {
    Wallet.disableUnsafeRawKeyExport();
});

test("Wallet.decrypt is blocked by default", async () => {
    Wallet.disableUnsafeRawKeyExport();
    const wallet = await Wallet.fromPrivateKey("test", PRIVATE_KEY, PASSWORD);

    const result = await wallet.withSigningCapability(
        PASSWORD,
        async (signingCapability) => {
            return signingCapability.getPublicKey().length > 0;
        },
    );
    assert.equal(result, true);
});

test("Wallet.withSigningCapability allows signing without raw key export", async () => {
    Wallet.disableUnsafeRawKeyExport();
    const wallet = await Wallet.fromPrivateKey("test", PRIVATE_KEY, PASSWORD);

    const result = await wallet.withSigningCapability(
        PASSWORD,
        async (signingCapability) => {
            const publicKey = signingCapability.getPublicKey();
            return publicKey.length > 0;
        },
    );
    assert.equal(result, true);
});

test("withSigningCapability signs without exposing raw key bytes", async () => {
    Wallet.disableUnsafeRawKeyExport();
    const wallet = await Wallet.fromPrivateKey("test", PRIVATE_KEY, PASSWORD);
    const digest = Uint8Array.from([
        1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
    ]);

    const signed = await wallet.withSigningCapability(
        PASSWORD,
        async (signingCapability) => {
            const signature = await signingCapability.signDigest(digest);
            const publicKey = signingCapability.getPublicKey();
            return { signature, publicKey };
        },
    );

    assert.equal(
        await verify(signed.signature, digest, signed.publicKey),
        true,
    );
});

test("signing capability cannot be reused after callback scope", async () => {
    Wallet.disableUnsafeRawKeyExport();
    const wallet = await Wallet.fromPrivateKey("test", PRIVATE_KEY, PASSWORD);
    const digest = Uint8Array.from([
        2, 2, 2, 2, 2, 2, 2, 2,
        2, 2, 2, 2, 2, 2, 2, 2,
        2, 2, 2, 2, 2, 2, 2, 2,
        2, 2, 2, 2, 2, 2, 2, 2,
    ]);

    let leakedCapability: SigningCapability | null = null;

    await wallet.withSigningCapability(PASSWORD, async (signingCapability) => {
        leakedCapability = signingCapability;
        await signingCapability.signDigest(digest);
    });

    assert.ok(leakedCapability);

    await assert.rejects(
        leakedCapability.signDigest(digest),
        /Signing capability has expired/,
    );
    assert.throws(
        () => leakedCapability.getPublicKey(),
        /Signing capability has expired/,
    );
});
