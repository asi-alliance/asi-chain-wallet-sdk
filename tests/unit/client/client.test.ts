import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import Client from "@domains/Client";
import Wallet, { WalletTypes } from "@domains/Wallet";
import { TNetworksConfig } from "@domains/Network";
import StorageManager from "@services/StorageManager";

const STORAGE_DIR = "./storage-client-test";

const PASSWORD = "12345678";

const NETWORKS_CONFIG: TNetworksConfig = {
    DevNet: {
        ValidatorURL:
            "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/bb93eaa595aaddf6912e372debc73eef/endpoint_0/HTTP_API",
        ReadOnlyURL:
            "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/bb93eaa595aaddf6912e372debc73eef/endpoint_0/HTTP_API",
        IndexerURL: "https://indexer.dev.asichain.io/v1/graphql",
    },
    Dev: {
        ValidatorURL: "http://202.181.159.96:40423",
        ReadOnlyURL: "http://202.181.159.96:40453",
        IndexerURL: "https://indexer.asi-chain.singularitynet.dev/v1/graphql",
    },
    MainNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
    TestNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
};

function logAct(title: string): void {
    console.log("\n========================================");
    console.log(title);
    console.log("========================================");
}

function printWallet(wallet: Wallet): void {
    console.log({
        walletId: wallet.getId(),
        signerId: wallet.getSigner().getId(),
        type: wallet.getType(),
        activeAccount: wallet.getActiveAccount()
            ? {
                  name: wallet.getActiveAccount()!.getName(),
                  index: wallet.getActiveAccount()!.getIndex(),
                  address: wallet.getActiveAccount()!.getAddress(),
              }
            : null,
        accounts: wallet.getAccounts().map((account) => ({
            name: account.getName(),
            index: account.getIndex(),
            address: account.getAddress(),
        })),
    });
}

interface ITestWalletState {
    wallet: Wallet;
    walletId: string;
    signerId: string;
    address: string;
}

test.before(async () => {
    console.log("\n[CLEANUP] Clearing storage...");
    await StorageManager.clear();
    StorageManager.close();
    await fs.rm(STORAGE_DIR, {
        recursive: true,
        force: true,
    });
    console.log("[CLEANUP] Storage cleared\n");
});

test("client user flow", async () => {
    let client: Client;

    let mnemonic: string;
    let privateKey: Uint8Array;

    let hd: ITestWalletState;
    let pk: ITestWalletState;

    logAct("ACT 1. User opens website for the first time");

    // await fs.rm(STORAGE_DIR, {
    //     recursive: true,
    //     force: true,
    // });

    client = await Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: "DevNet",
        storageOptions: {
            nodeStorageDir: STORAGE_DIR,
        },
    });

    const publicWallets = await client
        .getWalletManager()
        .getPublicWalletsMetadata();

    console.log("Public wallets:");
    console.log(publicWallets);

    console.log("Wallet count:");
    console.log(await client.getWalletManager().count());

    assert.deepEqual(publicWallets, []);

    assert.equal(await client.getWalletManager().count(), 0);

    logAct("ACT 2. Generate wallet secrets");

    mnemonic = client.generateMnemonic();

    privateKey = client.generatePrivateKey();

    console.log("Mnemonic:");
    console.log(mnemonic);

    console.log("\nPrivate key length:");
    console.log(privateKey.length);

    assert.equal(mnemonic.split(" ").length, 12);

    assert.equal(privateKey.length, 32);

    logAct("ACT 3. User creates HD wallet");

    const hdWallet = await client.createHDWallet(
        {
            mnemonic,
            accountName: "Main HD account",
        },
        PASSWORD,
    );

    printWallet(hdWallet);

    hd = {
        wallet: hdWallet,
        walletId: hdWallet.getId(),
        signerId: hdWallet.getSigner().getId(),
        address: hdWallet.getActiveAccount()!.getAddress(),
    };

    assert.equal(hdWallet.getType(), WalletTypes.HD);

    assert.equal(hdWallet.getAccounts().length, 1);

    assert.ok(hdWallet.getActiveAccount());

    assert.ok(hd.address);

    logAct("ACT 4. User creates Private Key wallet");

    const pkWallet = await client.createPrivateKeyWallet(
        {
            privateKey,
            accountName: "Main PK account",
        },
        PASSWORD,
    );

    printWallet(pkWallet);

    pk = {
        wallet: pkWallet,
        walletId: pkWallet.getId(),
        signerId: pkWallet.getSigner().getId(),
        address: pkWallet.getActiveAccount()!.getAddress(),
    };

    assert.equal(pkWallet.getType(), WalletTypes.PRIVATE_KEY);

    assert.equal(pkWallet.getAccounts().length, 1);

    assert.equal(pkWallet.getActiveAccount()!.getIndex(), null);

    assert.ok(pk.address);

    logAct("ACT 5. Wallet selection page");

    const walletsMetadata = await client
        .getWalletManager()
        .getPublicWalletsMetadata();

    console.log("Public wallets metadata:");

    console.dir(walletsMetadata, {
        depth: null,
    });

    assert.equal(walletsMetadata.length, 2);

    const hdMetadata = walletsMetadata.find(
        (wallet) => wallet.signerId === hd.signerId,
    );

    const pkMetadata = walletsMetadata.find(
        (wallet) => wallet.signerId === pk.signerId,
    );

    assert.ok(hdMetadata);
    assert.ok(pkMetadata);

    assert.equal(hdMetadata.type, WalletTypes.HD);
    assert.equal(pkMetadata.type, WalletTypes.PRIVATE_KEY);

    assert.equal(hdMetadata.accounts.length, 1);
    assert.equal(pkMetadata.accounts.length, 1);

    assert.equal(await client.getWalletManager().count(), 2);

    logAct("ACT 6. User closes website");

    client.close();

    console.log("Client successfully closed.");

    logAct("ACT 7. User opens website again");

    client = await Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: "DevNet",
        storageOptions: {
            nodeStorageDir: STORAGE_DIR,
        },
    });

    const restoredMetadata = await client
        .getWalletManager()
        .getPublicWalletsMetadata();

    console.log("Loaded public wallets:");

    console.dir(restoredMetadata, {
        depth: null,
    });

    assert.equal(restoredMetadata.length, 2);

    assert.equal(await client.getWalletManager().count(), 0);

    logAct("ACT 8. User unlocks HD wallet");

    const unlockedWallet = await client.unlockWallet(hd.signerId, PASSWORD);

    printWallet(unlockedWallet);

    assert.equal(unlockedWallet.getSigner().getId(), hd.signerId);

    assert.equal(unlockedWallet.getType(), WalletTypes.HD);

    assert.equal(unlockedWallet.getAccounts().length, 1);

    assert.equal(unlockedWallet.getActiveAccount()!.getAddress(), hd.address);

    hd.wallet = unlockedWallet;
    hd.walletId = unlockedWallet.getId();

    await client.deriveAccount(hd.walletId, "Account 2", PASSWORD);
    await client.deriveAccount(hd.walletId, "Account 3", PASSWORD);

    logAct("ACT 9. Accounts page after unlock");

    const accountsMap = unlockedWallet.getAccountsMap();
    const accountIds = Array.from(unlockedWallet.getAccountsMap().keys());
    const accounts = unlockedWallet.getAccounts();

    console.log("Accounts:");

    console.dir(
        Array.from(accountsMap.entries()).map(([id, account]) => ({
            id,
            name: account.getName(),
            index: account.getIndex(),
            address: account.getAddress(),
        })),
        { depth: null },
    );

    assert.equal(accountsMap.size, 3);

    const activeAccount = unlockedWallet.getActiveAccount();

    assert.ok(activeAccount);
    assert.ok(activeAccount.getAddress());

    logAct("ACT 10. Load balances");

    const balances = [];

    for (const account of accounts) {
        const balance = await account.getBalance();

        balances.push({
            address: account.getAddress(),
            amount: balance.amount,
        });

        console.log("Balance:", {
            address: account.getAddress(),
            amount: balance.amount,
        });
    }

    assert.equal(balances.length, accounts.length);

    logAct("ACT 11. Available balances (reservation-aware)");

    const available = await client.getAvailableBalance(
        hd.walletId,
        accountIds[0],
    );

    console.log("Available balance:", available);

    assert.ok(typeof available === "bigint");

    logAct("ACT 12. Reservations before transfer");

    const reservationsBefore = await client.getReservations(hd.walletId);

    console.log("Reservations:", reservationsBefore);

    assert.deepEqual(reservationsBefore, []);

    // logAct("ACT 13. Transfer execution");

    // const toAccount = accounts.length > 1 ? accounts[1] : accounts[0];

    // const amount = 100n;

    // console.log("Check wallet id: ", hd.walletId, hd.wallet.getId());
    // printWallet(hd.wallet);

    // const deployId = await client.transfer(
    //     {
    //         walletId: hd.walletId,
    //         accountId: accountIds[0],
    //         to: toAccount.getAddress(),
    //         amount,
    //     },
    //     PASSWORD,
    // );

    // const reservationsDuring = await client.getReservations(hd.walletId);

    // console.log("Reservations during transfer:");

    // console.dir(reservationsDuring, { depth: null });

    // assert.ok(reservationsDuring.length >= 0);

    // console.log("Deploy ID:", deployId);

    // const availableDuring = await client.getAvailableBalance(
    //     hd.walletId,
    //     accountIds[0],
    // );

    // console.log("Available during transfer:", availableDuring);

    // logAct("ACT 14. Wait for confirmation");

    // const poller = ApiServiceRegistry.getInstance().poller.watch(
    //     deployId,
    //     {
    //         onConfirmed: (r) => console.log("CONFIRMED:", r),
    //         onStatus: (s) => console.log("STATUS:", s),
    //         onError: (e) => console.log("ERROR:", e.message),
    //     },
    //     {
    //         intervalMs: 3000,
    //     },
    // );

    // await poller.done;

    // console.log("Transfer confirmed");

    // logAct("ACT 15. Post-transfer balance check");

    // const finalBalance = await client.getBalance(toAccount.getAddress());

    // console.log("Final balance:", finalBalance);

    // const availableAfter = await client.getAvailableBalance(
    //     hd.walletId,
    //     accountIds[0],
    // );

    // const fullBalance = await accounts[0].getBalance();

    // console.log({
    //     availableAfter,
    //     fullBalance: fullBalance.amount,
    // });

    // assert.equal(availableAfter, fullBalance.amount);

    logAct("ACT 15.1 Transaction history check");

    const senderAccount = accounts[0];

    const history = await senderAccount.getTransactionsHistory();

    console.log("Transaction history (sender):");

    console.dir(
        history.map((tx) => ({
            id: tx.id,
            amount: tx.amount,
            from: tx.from,
            to: tx.to,
            status: tx.status,
            timestamp: tx.timestamp,
        })),
        { depth: null },
    );

    logAct("ACT 16.1 Remove account");

    const accountsBeforeRemove = unlockedWallet.getAccounts();

    console.log("ACCOUNTS BEFORE REMOVE: ", accountsBeforeRemove);

    const accountToRemove = accountsBeforeRemove.find(
        (a) => a.getIndex() === 2,
    );

    console.log("ACCOUNT TO REMOVE: ", accountToRemove);

    assert.ok(accountToRemove);

    printWallet(hd.wallet);
    console.log(accountToRemove);

    await client.removeAccount(hd.walletId, accountToRemove.getId());

    const accountsAfterRemove = unlockedWallet.getAccounts();

    console.log(
        "Accounts after remove:",
        accountsAfterRemove.map((a) => ({
            name: a.getName(),
            index: a.getIndex(),
        })),
    );

    assert.ok(!accountsAfterRemove.find((a) => a.getIndex() === 2));

    logAct("ACT 16.2 Reuse freed index");

    const { account: reusedAccount } = await client.deriveAccount(
        hd.walletId,
        "Reused Account",
        PASSWORD,
    );

    console.log("Reused account:", {
        name: reusedAccount.getName(),
        index: reusedAccount.getIndex(),
        address: reusedAccount.getAddress(),
    });

    assert.equal(reusedAccount.getIndex(), 2);

    const finalIndexes = unlockedWallet
        .getAccounts()
        .map((a) => a.getIndex())
        .sort((a, b) => a! - b!);

    console.log("Final indexes:", finalIndexes);

    assert.deepEqual(finalIndexes, [0, 1, 2]);

    logAct("ACT 17. Wrong password unlock");

    let failed = false;

    try {
        await client.unlockWallet(hd.signerId, "wrong-password");
    } catch (e) {
        failed = true;
        console.log("Expected error:", (e as Error).message);
    }

    assert.equal(failed, true);

    logAct("ACT 18. Double unlock protection");

    let doubleFailed = false;

    try {
        await client.unlockWallet(hd.signerId, PASSWORD);
    } catch (e) {
        doubleFailed = true;
        console.log("Double unlock error:", (e as Error).message);
    }

    assert.equal(doubleFailed, true);

    logAct("ACT 19. Remove wallet");

    await client.removeWallet(hd.walletId);

    const walletsAfterRemove = await client
        .getWalletManager()
        .getPublicWalletsMetadata();

    console.log("Wallets after removal:", walletsAfterRemove);

    assert.equal(walletsAfterRemove.length, 1);

    assert.ok(!walletsAfterRemove.find((w) => w.signerId === hd.signerId));

    logAct("ACT 20. Clear persistence (logout)");

    await client.clearPersistence();

    const walletsAfterClear = await client
        .getWalletManager()
        .getPublicWalletsMetadata();

    console.log("After clear:", walletsAfterClear);

    assert.deepEqual(walletsAfterClear, []);

    assert.equal(await client.getWalletManager().count(), 0);

    logAct("ACT 21. Close client");

    client.close();

    console.log("Client closed successfully");
});
