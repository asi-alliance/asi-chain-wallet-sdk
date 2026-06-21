import test from "node:test";
import assert from "node:assert/strict";

import Client from "@domains/Client";
import Wallet from "@domains/Wallet";
import WalletsService from "@services/Wallets";
import ObserverClient from "@domains/ObserverClient";
import ValidatorClient from "@domains/ValidatorClient";
import AssetsService from "@services/AssetsService";

import "dotenv/config";
import { defaultAsset } from "@config/index";

test("HD wallet restores correct account private key during signing", async () => {
    const mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    const password = "123456";

    const passwordProvider = async () => ({
        password,
    });

    const { wallet } = await Wallet.fromMnemonic({
        mnemonic,
        name: "Test HD Wallet",
        passwordProvider,
        hdWalletOptions: {
            index: 3,
        },
    });

    const originalAddress = wallet.getAddress();

    await wallet.withSigningCapability(
        passwordProvider,
        async (signingCapability) => {
            const publicKey = signingCapability.getPublicKey();

            const restoredAddress =
                WalletsService.deriveAddressFromPublicKey(publicKey);

            assert.equal(restoredAddress, originalAddress);

            const digest = new Uint8Array(32).fill(1);

            const signature = await signingCapability.signDigest(digest);

            assert.ok(signature.length > 0);
        },
    );
});

test("client restores correct HD account when signing from third derived wallet", async () => {
    const mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    const password = "123456";

    const passwordProvider = async () => ({
        password,
    });

    const client = await Client.create({
        password,
    });

    const wallet0 = await client.createMnemonicWallet(
        mnemonic,
        "Account 0",
        passwordProvider,
        {
            index: 0,
        },
    );

    const wallet1 = await client.createMnemonicWallet(
        mnemonic,
        "Account 1",
        passwordProvider,
        {
            index: 1,
        },
    );

    const wallet2 = await client.createMnemonicWallet(
        mnemonic,
        "Account 2",
        passwordProvider,
        {
            index: 2,
        },
    );

    assert.notEqual(wallet0.getAddress(), wallet1.getAddress());

    assert.notEqual(wallet1.getAddress(), wallet2.getAddress());

    assert.equal(client.getWallets().length, 3);

    client.selectActiveWallet(wallet2.getAddress());

    const activeWallet = client.getActiveWallet();

    assert.ok(activeWallet);

    assert.equal(activeWallet!.getAddress(), wallet2.getAddress());

    await activeWallet!.withSigningCapability(
        passwordProvider,
        async (signingCapability) => {
            const restoredAddress = WalletsService.deriveAddressFromPublicKey(
                signingCapability.getPublicKey(),
            );

            assert.equal(restoredAddress, wallet2.getAddress());

            assert.notEqual(restoredAddress, wallet0.getAddress());

            assert.notEqual(restoredAddress, wallet1.getAddress());

            const digest = new Uint8Array(32).fill(1);

            const signature = await signingCapability.signDigest(digest);

            assert.ok(signature.length > 0);
        },
    );
});

test("HD wallet creates three accounts and gets balance of third derived account", async () => {
    const mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    const passwordProvider = async () => ({
        password: "123456",
    });

    const network = JSON.parse(process.env.VITE_NETWORKS!).Dev;

    const observerClient = new ObserverClient({
        baseUrl: network.ReadOnlyURL,
    });

    const validatorClient = new ValidatorClient({
        baseUrl: network.ValidatorURL,
    });

    const assetsService = new AssetsService(observerClient, validatorClient);

    const account0 = await Wallet.fromMnemonic({
        mnemonic,
        name: "Account 0",
        passwordProvider,
        hdWalletOptions: {
            index: 0,
        },
    });

    const account1 = await Wallet.fromMnemonic({
        mnemonic,
        name: "Account 1",
        passwordProvider,
        hdWalletOptions: {
            index: 1,
        },
    });

    const account2 = await Wallet.fromMnemonic({
        mnemonic,
        name: "Account 2",
        passwordProvider,
        hdWalletOptions: {
            index: 2,
        },
    });

    const wallet0 = account0.wallet;
    const wallet1 = account1.wallet;
    const wallet2 = account2.wallet;

    assert.notEqual(wallet0.getAddress(), wallet1.getAddress());

    assert.notEqual(wallet1.getAddress(), wallet2.getAddress());

    assert.notEqual(wallet0.getAddress(), wallet2.getAddress());

    await wallet2.withSigningCapability(
        passwordProvider,
        async (signingCapability) => {
            const restoredAddress = WalletsService.deriveAddressFromPublicKey(
                signingCapability.getPublicKey(),
            );

            assert.equal(restoredAddress, wallet2.getAddress());
        },
    );

    const balance = await assetsService.getBalance(
        wallet2.getAddress(),
        defaultAsset,
    );

    assert.equal(balance.asset.getName(), "ASI");

    assert.ok(balance.amount >= 0n);
});
