import test from "node:test";
import assert from "node:assert/strict";

import Wallet, { WalletTypes } from "../../../scenarios/src/domains/Wallet";
import Account from "../../../scenarios/src/domains/Account";

import SecretsProvider from "../../../scenarios/src/domains/SecretsProvider";

import Bip44Path from "../../../scenarios/src/domains/Bip44Path";
import KeysManager from "../../../scenarios/src/services/KeysManager";

const MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const PASSWORD = "12345678";

const passwordProvider = new SecretsProvider(() => ({
    password: PASSWORD,
}));

const accountPayload = {
    name: "Main account",
};

const customPath = new Bip44Path({
    coinType: 60,
    account: 0,
    change: 0,
    index: 9,
});

const printWalletState = (title: string, wallet: Wallet) => {
    console.log("\n==============================");
    console.log(title);
    console.log("==============================");

    console.log("Wallet id:", wallet.getId());

    console.log("Wallet type:", wallet.getType());

    console.log("Accounts count:", wallet.getAccounts().length);

    console.log(
        "Active account:",
        wallet.getActiveAccount()
            ? {
                  name: wallet.getActiveAccount()?.getName(),

                  index: wallet.getActiveAccount()?.getIndex(),

                  address: wallet.getActiveAccount()?.getAddress(),
              }
            : null,
    );

    console.log("\nAccounts:");

    wallet.getAccounts().forEach((account: Account, index: number) => {
        console.log(`Account #${index}`, {
            name: account.getName(),

            index: account.getIndex(),

            address: account.getAddress(),
        });
    });

    console.log("==============================\n");
};

test("PK wallet should not derive accounts", async () => {
    const wallet = await Wallet.createPk(
        {
            ...accountPayload,
            index: 0,
        },
        new SecretsProvider(() => ({
            secret: {
                privateKey: KeysManager.generateRandomKey(),
            },
            password: PASSWORD,
        })),
    );

    printWalletState("PK WALLET CREATED", wallet);

    assert.equal(wallet.getType(), WalletTypes.PRIVATE_KEY);

    assert.equal(wallet.getAccounts().length, 1);

    console.log("Trying to derive account from PK wallet...");

    await assert.rejects(async () => {
        await wallet.deriveAccount(accountPayload, passwordProvider);
    });

    console.log("PK derive correctly rejected");
});

test("HD wallet should derive accounts with incremental indexes from zero", async () => {
    const wallet = await Wallet.createHD(
        {
            mnemonic: MNEMONIC,
            accountOptions: accountPayload,
            pathOptions: {
                index: 0,
            },
        },
        passwordProvider,
    );

    printWalletState("HD WALLET BEFORE DERIVATION", wallet);

    const account1 = await wallet.deriveAccount(
        {
            name: "Account 2",
        },
        passwordProvider,
    );

    console.log("Created account #2:", {
        name: account1.getName(),

        index: account1.getIndex(),

        address: account1.getAddress(),
    });

    const account2 = await wallet.deriveAccount(
        {
            name: "Account 3",
        },
        passwordProvider,
    );

    console.log("Created account #3:", {
        name: account2.getName(),

        index: account2.getIndex(),

        address: account2.getAddress(),
    });

    printWalletState("HD WALLET AFTER DERIVATION", wallet);

    const indexes = wallet
        .getAccounts()
        .map((account) => account.getIndex())
        .sort((a, b) => a! - b!);

    console.log("Calculated indexes:", indexes);

    assert.deepEqual(indexes, [0, 1, 2]);

    assert.notEqual(account1.getAddress(), account2.getAddress());
});

test("HD wallet should derive accounts from custom HD path index", async () => {
    const wallet = await Wallet.createHD(
        {
            mnemonic: MNEMONIC,
            accountOptions: accountPayload,
            pathOptions: {
                customHDPath: customPath,
            },
        },
        passwordProvider,
    );

    printWalletState("CUSTOM HD WALLET BEFORE DERIVATION", wallet);

    const account10 = await wallet.deriveAccount(
        {
            name: "Account 10",
        },
        passwordProvider,
    );

    console.log("Created account #10:", {
        name: account10.getName(),

        index: account10.getIndex(),

        address: account10.getAddress(),
    });

    const account11 = await wallet.deriveAccount(
        {
            name: "Account 11",
        },
        passwordProvider,
    );

    console.log("Created account #11:", {
        name: account11.getName(),

        index: account11.getIndex(),

        address: account11.getAddress(),
    });

    printWalletState("CUSTOM HD WALLET AFTER DERIVATION", wallet);

    const indexes = wallet
        .getAccounts()
        .map((account) => account.getIndex())
        .sort((a, b) => a! - b!);

    console.log("Custom HD indexes:", indexes);

    assert.deepEqual(indexes, [9, 10, 11]);

    assert.notEqual(account10.getAddress(), account11.getAddress());
});
