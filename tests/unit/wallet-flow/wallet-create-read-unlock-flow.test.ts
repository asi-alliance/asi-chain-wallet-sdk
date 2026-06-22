import test from "node:test";
import assert from "node:assert/strict";

import Client from "@domains/Client";
import WalletsService from "@services/Wallets";
import KeysManager from "@services/KeysManager";

test("client creates and unlocks PK and HD wallets correctly", async () => {
    const password = "123456";

    const passwordProvider = async () => ({
        password,
    });

    const client = await Client.create({
        password,
    });

    /**
     * ======================
     * Create PK wallet
     * ======================
     */

    const originalPrivateKey = KeysManager.generateRandomKey();

    const pkPasswordProvider = async () => ({
        password,
        privateKey: originalPrivateKey,
    });

    const pkWallet = await client.createPKWallet(
        "Private Key Wallet",
        pkPasswordProvider,
    );

    /**
     * ======================
     * Create HD wallet
     * ======================
     */

    const mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    const hdWallet = await client.createMnemonicWallet(
        mnemonic,
        "HD Wallet",
        passwordProvider,
        {
            index: 5,
        },
    );

    assert.equal(client.getWallets().length, 2);

    /**
     * ======================
     * Unlock PK wallet
     * ======================
     */

    const unlockedPKWallet = await client.unlockWallet(
        pkWallet.getId(),
        passwordProvider,
    );

    assert.equal(unlockedPKWallet.getAddress(), pkWallet.getAddress());

    await unlockedPKWallet.withSigningCapability(
        passwordProvider,
        async (signingCapability) => {
            const publicKey = signingCapability.getPublicKey();

            const restoredAddress =
                WalletsService.deriveAddressFromPublicKey(publicKey);

            assert.equal(restoredAddress, pkWallet.getAddress());

            const signature = await signingCapability.signDigest(
                new Uint8Array(32).fill(1),
            );

            assert.ok(signature.length > 0);

            console.log("PK wallet:");
            console.log({
                id: pkWallet.getId(),
                address: pkWallet.getAddress(),
                publicKey: Buffer.from(publicKey).toString("hex"),
            });
        },
    );

    /**
     * ======================
     * Unlock HD wallet
     * ======================
     */

    const unlockedHDWallet = await client.unlockWallet(
        hdWallet.getId(),
        passwordProvider,
    );

    assert.equal(unlockedHDWallet.getAddress(), hdWallet.getAddress());

    await unlockedHDWallet.withSigningCapability(
        passwordProvider,
        async (signingCapability) => {
            const publicKey = signingCapability.getPublicKey();

            const restoredAddress =
                WalletsService.deriveAddressFromPublicKey(publicKey);

            assert.equal(restoredAddress, hdWallet.getAddress());

            const signature = await signingCapability.signDigest(
                new Uint8Array(32).fill(2),
            );

            assert.ok(signature.length > 0);

            console.log("HD wallet:");
            console.log({
                id: hdWallet.getId(),
                address: hdWallet.getAddress(),
                index: hdWallet.getIndex(),
                publicKey: Buffer.from(publicKey).toString("hex"),
            });
        },
    );
});
