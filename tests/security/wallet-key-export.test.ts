import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import Wallet from "../../src/domains/Wallet";

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

    await assert.rejects(
        wallet.decrypt(PASSWORD),
        /Wallet\.decrypt is disabled by default/,
    );
});

test("Wallet.decrypt can be explicitly re-enabled for legacy interop", async () => {
    Wallet.enableUnsafeRawKeyExportForLegacyInterop();
    const wallet = await Wallet.fromPrivateKey("test", PRIVATE_KEY, PASSWORD);

    const decrypted = await wallet.decrypt(PASSWORD);

    assert.deepEqual(Array.from(decrypted), Array.from(PRIVATE_KEY));
});

test("withDecryptedPrivateKey remains available when raw export is disabled", async () => {
    Wallet.disableUnsafeRawKeyExport();
    const wallet = await Wallet.fromPrivateKey("test", PRIVATE_KEY, PASSWORD);

    const firstBytes = await wallet.withDecryptedPrivateKey(
        PASSWORD,
        (privateKey) => privateKey.slice(0, 4),
    );

    assert.deepEqual(Array.from(firstBytes), [1, 2, 3, 4]);
});
