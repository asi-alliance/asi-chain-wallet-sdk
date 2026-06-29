import test from "node:test";
import assert from "node:assert/strict";

import Wallet, { WalletTypes } from "../../../scenarios/src/domains/Wallet";
import SecretsProvider from "../../../scenarios/src/domains/SecretsProvider";
import KeysManager from "../../../scenarios/src/services/KeysManager";
import StorageManager from "../../../scenarios/src/services/StorageManager";
import { AccountsStorageRepository } from "../../../scenarios/src/domains/AccountsStorageRepository";
import { SignersStorageRepository } from "../../../scenarios/src/domains/SignersStorageRepository";
import Bip44Path from "../../../scenarios/src/domains/Bip44Path";

const MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const PASSWORD = "12345678";

const passwordProvider = new SecretsProvider(() => ({
    password: PASSWORD,
}));

const accountOptions = {
    name: "Main account",
};

const createPkProvider = (password: string) => {
    const privateKey = KeysManager.generateRandomKey();

    console.log(
        "[createPkProvider] Private key generated:",
        privateKey.toString().substring(0, 20) + "...",
    );

    return {
        provider: new SecretsProvider(() => ({
            secret: {
                privateKey,
            },
            password,
        })),
        privateKey,
    };
};

test("should save PK wallet into storage", async () => {
    console.log("\n=== SAVE PRIVATE KEY WALLET TO STORAGE ===");

    console.log("\n[1] Creating Private Key wallet...");
    const { provider, privateKey } = createPkProvider(PASSWORD);
    console.log(
        "    Private key (first 20 chars):",
        privateKey.toString().substring(0, 20) + "...",
    );
    console.log("    Password:", PASSWORD);

    console.log("\n[2] Creating wallet instance...");
    const wallet = await Wallet.createPk(accountOptions, provider);
    const signerId = wallet.getSigner().getId();
    const account = wallet.getActiveAccount();
    console.log("    Wallet ID:", wallet.getId());
    console.log("    Wallet Type:", wallet.getType());
    console.log("    Signer ID:", signerId);
    console.log("    Account name:", account?.getName());
    console.log("    Account address:", account?.getAddress());

    console.log("\n[3] Saving wallet to storage...");
    await StorageManager.saveWallet({
        signerId,
        wallet,
    });
    console.log("    Wallet saved successfully");

    console.log("\n[4] Reading saved data from storage...");
    const signers = await StorageManager.getSigners();
    const accounts = await StorageManager.getAccounts();

    console.log("    Signers found:", signers.length);
    console.log("    Accounts found:", accounts.length);

    if (signers.length > 0) {
        console.log("    First signer ID:", signers[0].id);
        console.log("    First signer type:", signers[0].type);
        console.log(
            "    First signer encryptedData:",
            signers[0].encryptedData,
        );
    }

    if (accounts.length > 0) {
        console.log("    First account signerId:", accounts[0].signerId);
        console.log("    First account name:", accounts[0].name);
        console.log("    First account index:", accounts[0].index);
    }

    console.log("\n[5] Assertions:");
    console.log("    Signers count == 1:", signers.length === 1);
    assert.equal(signers.length, 1);

    console.log("    Accounts count == 1:", accounts.length === 1);
    assert.equal(accounts.length, 1);

    console.log("    Signer ID matches:", signers[0].id === signerId);
    assert.equal(signers[0].id, signerId);

    console.log(
        "    Account signerId matches:",
        accounts[0].signerId === signerId,
    );
    assert.equal(accounts[0].signerId, signerId);

    console.log(
        "    Account name matches:",
        accounts[0].name === "Main account",
    );
    assert.equal(accounts[0].name, "Main account");

    console.log("\n=== TEST PASSED ===\n");
});

test("should restore PK wallet from storage", async () => {
    console.log("\n=== RESTORE PRIVATE KEY WALLET FROM STORAGE ===");

    console.log("\n[1] Creating original Private Key wallet...");
    const { provider, privateKey } = createPkProvider(PASSWORD);
    console.log(
        "    Private key (first 20 chars):",
        privateKey.toString().substring(0, 20) + "...",
    );
    console.log("    Password:", PASSWORD);

    console.log("\n[2] Creating original wallet instance...");
    const originalWallet = await Wallet.createPk(accountOptions, provider);
    const originalSignerId = originalWallet.getSigner().getId();
    const originalAccount = originalWallet.getActiveAccount();
    console.log("    Wallet ID:", originalWallet.getId());
    console.log("    Wallet Type:", originalWallet.getType());
    console.log("    Signer ID:", originalSignerId);
    console.log("    Account name:", originalAccount?.getName());
    console.log("    Account address:", originalAccount?.getAddress());

    console.log("\n[3] Saving original wallet to storage...");
    await StorageManager.saveWallet({
        signerId: originalSignerId,
        wallet: originalWallet,
    });
    console.log("    Original wallet saved successfully");

    console.log("\n[4] Reading signers from storage before restore...");
    const signersBefore = await StorageManager.getSigners();
    console.log("    Signers in storage:", signersBefore.length);
    signersBefore.forEach((s, i) => {
        console.log(`    Signer ${i + 1}: ID=${s.id}, type=${s.type}`);
    });

    console.log("\n[5] Restoring wallet from storage...");
    console.log("    Looking for signer ID:", originalSignerId);
    const restoredWallet = await StorageManager.getWallet({
        signerId: originalSignerId,
        passwordProvider,
    });
    console.log("    Wallet restored successfully");

    const restoredAccount = restoredWallet.getActiveAccount();
    console.log("    Restored wallet ID:", restoredWallet.getId());
    console.log("    Restored wallet type:", restoredWallet.getType());
    console.log("    Restored signer ID:", restoredWallet.getSigner().getId());
    console.log("    Restored account name:", restoredAccount?.getName());
    console.log("    Restored account address:", restoredAccount?.getAddress());

    console.log("\n[6] Comparing original vs restored:");
    const originalAddress = originalAccount?.getAddress();
    const restoredAddress = restoredAccount?.getAddress();
    console.log("    Original address:", originalAddress);
    console.log("    Restored address:", restoredAddress);
    console.log("    Addresses match:", originalAddress === restoredAddress);

    console.log("\n[7] Assertions:");
    console.log(
        "    Wallet type is PRIVATE_KEY:",
        restoredWallet.getType() === WalletTypes.PRIVATE_KEY,
    );
    assert.equal(restoredWallet.getType(), WalletTypes.PRIVATE_KEY);

    console.log("    Addresses match:", restoredAddress === originalAddress);
    assert.equal(restoredAddress, originalAddress);

    console.log("\n=== TEST PASSED ===\n");
});

test("should save and restore HD wallet from storage", async () => {
    console.log("\n=== SAVE AND RESTORE HD WALLET FROM STORAGE ===");

    console.log("\n[1] Creating HD wallet...");
    console.log(
        "    Mnemonic (first 30 chars):",
        MNEMONIC.substring(0, 30) + "...",
    );
    console.log("    Password:", PASSWORD);
    console.log("    Account options:", JSON.stringify(accountOptions));

    console.log("\n[2] Creating HD wallet instance...");
    const wallet = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            index: 0,
        },
    });
    const signerId = wallet.getSigner().getId();
    const account = wallet.getActiveAccount();
    console.log("    Wallet ID:", wallet.getId());
    console.log("    Wallet Type:", wallet.getType());
    console.log("    Signer ID:", signerId);
    console.log("    Account name:", account?.getName());
    console.log("    Account address:", account?.getAddress());

    console.log("\n[3] Saving HD wallet to storage...");
    await StorageManager.saveWallet({
        signerId: signerId,
        wallet: wallet,
    });
    console.log("    HD wallet saved successfully");

    console.log("\n[4] Reading signers from storage...");
    const signers = await StorageManager.getSigners();
    console.log("    Signers in storage:", signers.length);
    signers.forEach((s, i) => {
        console.log(`    Signer ${i + 1}: ID=${s.id}, type=${s.type}`);
    });

    console.log("\n[5] Restoring HD wallet from storage...");
    console.log("    Looking for signer ID:", signerId);
    const restored = await StorageManager.getWallet({
        signerId: signerId,
        passwordProvider,
    });
    console.log("    HD wallet restored successfully");

    const restoredAccount = restored.getActiveAccount();
    console.log("    Restored wallet ID:", restored.getId());
    console.log("    Restored wallet type:", restored.getType());
    console.log("    Restored signer ID:", restored.getSigner().getId());
    console.log("    Restored account name:", restoredAccount?.getName());
    console.log("    Restored account address:", restoredAccount?.getAddress());

    console.log("\n[6] Comparing original vs restored:");
    const originalAddress = account?.getAddress();
    const restoredAddress = restoredAccount?.getAddress();
    console.log("    Original address:", originalAddress);
    console.log("    Restored address:", restoredAddress);
    console.log("    Addresses match:", originalAddress === restoredAddress);

    console.log("\n[7] Assertions:");
    console.log(
        "    Wallet type is HD:",
        restored.getType() === WalletTypes.HD,
    );
    assert.equal(restored.getType(), WalletTypes.HD);

    console.log("    Addresses match:", restoredAddress === originalAddress);
    assert.equal(restoredAddress, originalAddress);

    console.log("\n=== TEST PASSED ===\n");
});

test("should isolate accounts between different signers", async () => {
    console.log("\n=== ISOLATE ACCOUNTS BETWEEN DIFFERENT SIGNERS ===");

    console.log("\n[1] Creating PK wallet...");
    const pkProvider = createPkProvider(PASSWORD).provider;
    const wallet1 = await Wallet.createPk(accountOptions, pkProvider);
    const signerId1 = wallet1.getSigner().getId();
    const account1 = wallet1.getActiveAccount();
    console.log("    PK Wallet signer ID:", signerId1);
    console.log("    PK Wallet account address:", account1?.getAddress());

    console.log("\n[2] Creating HD wallet...");
    const wallet2 = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            index: 1,
        },
    });
    const signerId2 = wallet2.getSigner().getId();
    const account2 = wallet2.getActiveAccount();
    console.log("    HD Wallet signer ID:", signerId2);
    console.log("    HD Wallet account address:", account2?.getAddress());

    console.log("\n[3] Saving both wallets to storage...");
    await StorageManager.saveWallet({
        signerId: signerId1,
        wallet: wallet1,
    });
    console.log("    PK wallet saved");

    await StorageManager.saveWallet({
        signerId: signerId2,
        wallet: wallet2,
    });
    console.log("    HD wallet saved");

    console.log("\n[4] Reading signers from storage...");
    const signers = await StorageManager.getSigners();
    console.log("    Signers in storage:", signers.length);
    signers.forEach((s, i) => {
        console.log(`    Signer ${i + 1}: ID=${s.id}, type=${s.type}`);
    });

    console.log("\n[5] Restoring both wallets...");
    console.log("    Restoring PK wallet with signer ID:", signerId1);
    const restored1 = await StorageManager.getWallet({
        signerId: signerId1,
        passwordProvider,
    });
    const restoredAddress1 = restored1.getActiveAccount()?.getAddress();
    console.log("    Restored PK address:", restoredAddress1);

    console.log("    Restoring HD wallet with signer ID:", signerId2);
    const restored2 = await StorageManager.getWallet({
        signerId: signerId2,
        passwordProvider,
    });
    const restoredAddress2 = restored2.getActiveAccount()?.getAddress();
    console.log("    Restored HD address:", restoredAddress2);

    console.log("\n[6] Comparison:");
    console.log("    PK address:", restoredAddress1);
    console.log("    HD address:", restoredAddress2);
    console.log(
        "    Addresses are different:",
        restoredAddress1 !== restoredAddress2,
    );

    console.log("\n[7] Assertions:");
    console.log(
        "    Addresses are different:",
        restoredAddress1 !== restoredAddress2,
    );
    assert.notEqual(restoredAddress1, restoredAddress2);

    console.log("\n=== TEST PASSED ===\n");
});

test("should complete full wallet storage lifecycle with multiple wallet types", async () => {
    console.log("\n=== FULL WALLET STORAGE LIFECYCLE ===");

    //
    // 1. CREATE WALLETS
    //

    console.log("\n[1] Creating PK wallet...");

    const pkWallet = await Wallet.createPk(
        accountOptions,
        createPkProvider(PASSWORD).provider,
    );

    const pkSignerId = pkWallet.getSigner().getId();

    console.log("    PK signer ID:", pkSignerId);
    console.log("    PK address:", pkWallet.getActiveAccount()?.getAddress());

    console.log("\n[2] Creating HD wallet...");

    const hdWallet = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            index: 0,
        },
    });

    const hdSignerId = hdWallet.getSigner().getId();

    console.log("    HD signer ID:", hdSignerId);
    console.log("    HD address:", hdWallet.getActiveAccount()?.getAddress());

    console.log("\n[3] Creating HD custom path wallet...");

    const customHDWallet = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            customHDPath: new Bip44Path({
                coinType: 44,
                account: 501,
                change: 1,
                index: 132,
            }),
        },
    });

    const customHDSignerId = customHDWallet.getSigner().getId();

    console.log("    Custom HD signer ID:", customHDSignerId);

    console.log(
        "    Custom HD address:",
        customHDWallet.getActiveAccount()?.getAddress(),
    );

    //
    // 2. DERIVE ADDITIONAL ACCOUNTS
    //

    console.log("\n[4] Deriving accounts for HD wallets...");

    await hdWallet.deriveAccount(
        {
            name: "HD Account 1",
        },
        passwordProvider,
    );

    await hdWallet.deriveAccount(
        {
            name: "HD Account 2",
        },
        passwordProvider,
    );

    await customHDWallet.deriveAccount(
        {
            name: "Custom HD Account 1",
        },
        passwordProvider,
    );

    await customHDWallet.deriveAccount(
        {
            name: "Custom HD Account 2",
        },
        passwordProvider,
    );

    console.log("    HD accounts:", hdWallet.getAccounts().length);

    console.log("    Custom HD accounts:", customHDWallet.getAccounts().length);

    //
    // 3. SAVE ALL WALLETS
    //

    console.log("\n[5] Saving wallets into storage...");

    await StorageManager.saveWallet({
        signerId: pkSignerId,
        wallet: pkWallet,
    });

    await StorageManager.saveWallet({
        signerId: hdSignerId,
        wallet: hdWallet,
    });

    await StorageManager.saveWallet({
        signerId: customHDSignerId,
        wallet: customHDWallet,
    });

    console.log("    All wallets saved");

    //
    // 4. SIMULATE WEBSITE RELOAD
    //

    console.log("\n[6] Reading public wallet data...");

    const publicWallets = await StorageManager.getWallets();

    console.log("    Wallets available:", publicWallets.length);

    publicWallets.forEach((wallet, index) => {
        console.log(`\n    Wallet ${index + 1}`);

        console.log("       Signer ID:", wallet.signer.id);

        console.log("       Type:", wallet.signer.type);

        console.log("       Accounts:", wallet.accounts.length);

        wallet.accounts.forEach((account) => {
            console.log("          -", account.name, "index:", account.index);
        });
    });

    //
    // 5. UNLOCK EACH WALLET
    //

    console.log("\n[7] Unlocking wallets...");

    const restoredPk = await StorageManager.getWallet({
        signerId: pkSignerId,
        passwordProvider,
    });

    const restoredHD = await StorageManager.getWallet({
        signerId: hdSignerId,
        passwordProvider,
    });

    const restoredCustomHD = await StorageManager.getWallet({
        signerId: customHDSignerId,
        passwordProvider,
    });

    console.log("\n    Restored PK accounts:", restoredPk.getAccounts().length);

    console.log("    Restored HD accounts:", restoredHD.getAccounts().length);

    console.log(
        "    Restored Custom HD accounts:",
        restoredCustomHD.getAccounts().length,
    );

    //
    // 6. VERIFY ADDRESSES
    //

    console.log("\n[8] Verifying restored addresses...");

    const originalPKAddress = pkWallet.getActiveAccount()?.getAddress();

    const restoredPKAddress = restoredPk.getActiveAccount()?.getAddress();

    const originalHDAddress = hdWallet.getActiveAccount()?.getAddress();

    const restoredHDAddress = restoredHD.getActiveAccount()?.getAddress();

    const originalCustomAddress = customHDWallet
        .getActiveAccount()
        ?.getAddress();

    const restoredCustomAddress = restoredCustomHD
        .getActiveAccount()
        ?.getAddress();

    console.log("    PK:", originalPKAddress === restoredPKAddress);

    console.log("    HD:", originalHDAddress === restoredHDAddress);

    console.log(
        "    Custom HD:",
        originalCustomAddress === restoredCustomAddress,
    );

    //
    // ASSERTIONS
    //

    console.log("\n[9] Assertions");

    assert.equal(publicWallets.length, 3);

    assert.equal(restoredPk.getType(), WalletTypes.PRIVATE_KEY);

    assert.equal(restoredHD.getType(), WalletTypes.HD);

    assert.equal(restoredCustomHD.getType(), WalletTypes.HD);

    assert.equal(restoredPKAddress, originalPKAddress);

    assert.equal(restoredHDAddress, originalHDAddress);

    assert.equal(restoredCustomAddress, originalCustomAddress);

    assert.equal(restoredHD.getAccounts().length, 3);

    assert.equal(restoredCustomHD.getAccounts().length, 3);

    console.log("\n=== TEST PASSED ===\n");
});

test.afterEach(async () => {
    console.log("\n[CLEANUP] Clearing storage...");
    await SignersStorageRepository.getInstance().clearAllData();
    await AccountsStorageRepository.getInstance().clearAllData();
    console.log("[CLEANUP] Storage cleared\n");
});
