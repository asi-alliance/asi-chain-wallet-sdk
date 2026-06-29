import test from "node:test";
import assert from "node:assert/strict";
import SecretsProvider, {
    IHDSecret,
    IPrivateKeyCredentials,
} from "../../../scenarios/src/domains/SecretsProvider";
import KeysManager from "../../../scenarios/src/services/KeysManager";
import Wallet, { WalletTypes } from "../../../scenarios/src/domains/Wallet";
import Bip44Path from "../../../scenarios/src/domains/Bip44Path";
import { ISignerRecord } from "../../../scenarios/src/domains/Signer";
import { IAccountRecord } from "../../../scenarios/src/domains/Account";
import { decryptSignerData } from "../../../scenarios/src/utils";

const MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const PASSWORD = "12345678";

const passwordProvider = new SecretsProvider(() => ({
    password: PASSWORD,
}));

const createPkProvider = (password: string) => {
    const privateKey = KeysManager.generateRandomKey();

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

const accountOptions = {
    name: "Main account",
};

const createSignerRecord = (wallet: Wallet): ISignerRecord => ({
    id: "signer-id",
    type: wallet.getType(),
    encryptedData: wallet.getSigner().getEncryptedSecret(),
});

const createAccountRecords = (wallet: Wallet): IAccountRecord[] =>
    Array.from(wallet.getAccountsMap()).map(([id, account]) => ({
        id,
        signerId: "signer-id",
        name: account.getName(),
        index: account.getIndex(),
    }));

const PAYLOAD =
    "0102030405060708091011121314151617181920212223242526272829303132";

const accountPayload = {
    name: "Main account",
};

test("should create PK wallet", async () => {
    const { provider, privateKey } = createPkProvider(PASSWORD);

    const wallet = await Wallet.createPk(accountOptions, provider);

    const activeAccount = wallet.getActiveAccount();

    const decrypted = (await decryptSignerData(
        wallet.getSigner().getEncryptedSecret(),
        passwordProvider,
    )) as IPrivateKeyCredentials;

    console.log("\n[PK Wallet Creation]");
    console.log("Wallet ID:", wallet.getId());
    console.log("Wallet Type:", wallet.getType());
    console.log("Accounts count:", wallet.getAccounts().length);
    console.log("Account name:", activeAccount?.getName());
    console.log("Account index:", activeAccount?.getIndex());
    console.log("Account address:", activeAccount?.getAddress());
    console.log(
        "Private key restored:",
        Buffer.from(decrypted.privateKey).equals(Buffer.from(privateKey)),
    );

    assert.equal(wallet.getType(), WalletTypes.PRIVATE_KEY);
    assert.ok(wallet.getId());
    assert.ok(wallet.getSigner());
    assert.equal(wallet.getAccounts().length, 1);
    assert.ok(activeAccount);
    assert.equal(activeAccount?.getName(), "Main account");
    assert.equal(activeAccount?.getIndex(), null);
    assert.ok(activeAccount?.getAddress());
    assert.deepEqual(decrypted.privateKey, privateKey);
});

test("should sign payload with PK wallet signer", async () => {
    const { provider } = createPkProvider(PASSWORD);

    const wallet = await Wallet.createPk(accountOptions, provider);

    const result = await wallet.getSigner().sign(PAYLOAD, {
        passwordProvider,
    });

    console.log("\n[PK Signing]");
    console.log("Payload:", PAYLOAD);
    console.log("Signature length:", result.signature.length);
    console.log("Public key length:", result.publicKey.length);
    console.log("Signature:", Buffer.from(result.signature).toString("hex"));

    assert.ok(result.signature instanceof Uint8Array);
    assert.ok(result.publicKey instanceof Uint8Array);
});

test("should create HD wallet", async () => {
    const wallet = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            index: 0,
        },
    });

    const account = wallet.getActiveAccount();

    const secret = (await decryptSignerData(
        wallet.getSigner().getEncryptedSecret(),
        passwordProvider,
    )) as IHDSecret;

    console.log("\n[HD Wallet Creation]");
    console.log("Wallet ID:", wallet.getId());
    console.log("Wallet Type:", wallet.getType());
    console.log("Account address:", account?.getAddress());
    console.log("HD Path:", secret.rootHDPath.toString());
    console.log("Seed length:", secret.seed.length);

    assert.equal(wallet.getType(), WalletTypes.HD);
    assert.equal(wallet.getAccounts().length, 1);
    assert.ok(account);
    assert.ok(account?.getAddress());
    assert.ok(typeof secret.seed === "string");
    assert.ok(secret.rootHDPath instanceof Bip44Path);
});

test("HD wallet should generate different addresses for different indexes", async () => {
    const wallet0 = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            index: 0,
        },
    });

    const wallet1 = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            index: 1,
        },
    });

    const address0 = wallet0.getActiveAccount()?.getAddress();

    const address1 = wallet1.getActiveAccount()?.getAddress();

    console.log("\n[HD Address Derivation]");
    console.log("Index 0 address:", address0);
    console.log("Index 1 address:", address1);
    console.log("Addresses different:", address0 !== address1);

    assert.notEqual(address0, address1);
});

test("should restore PK wallet", async () => {
    const { provider } = createPkProvider(PASSWORD);

    const original = await Wallet.createPk(accountOptions, provider);

    const restored = await Wallet.restore(
        passwordProvider,
        createSignerRecord(original),
        createAccountRecords(original),
    );

    const originalAddress = original.getActiveAccount()?.getAddress();

    const restoredAddress = restored
        .getAccounts()
        .values()
        .next()
        .value?.getAddress();

    console.log("\n[PK Wallet Restore]");
    console.log("Original address:", originalAddress);
    console.log("Restored address:", restoredAddress);
    console.log(
        "Address restored correctly:",
        originalAddress === restoredAddress,
    );

    assert.equal(restored.getType(), WalletTypes.PRIVATE_KEY);
    assert.equal(restored.getAccounts().length, 1);
    assert.equal(restoredAddress, originalAddress);
});

test("should restore HD wallet", async () => {
    const original = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            index: 0,
        },
    });

    const restored = await Wallet.restore(
        passwordProvider,
        createSignerRecord(original),
        createAccountRecords(original),
    );

    const originalAddress = original.getActiveAccount()?.getAddress();

    const restoredAddress = restored
        .getAccounts()
        .values()
        .next()
        .value?.getAddress();

    console.log("\n[HD Wallet Restore]");
    console.log("Original address:", originalAddress);
    console.log("Restored address:", restoredAddress);
    console.log("Restore successful:", originalAddress === restoredAddress);

    assert.equal(restoredAddress, originalAddress);
});

test("should fail decrypt with wrong password", async () => {
    const { provider } = createPkProvider(PASSWORD);

    const wallet = await Wallet.createPk(accountOptions, provider);

    const wrongPassword = new SecretsProvider(() => ({
        password: "wrong",
    }));

    let failed = false;

    try {
        await decryptSignerData(
            wallet.getSigner().getEncryptedSecret(),
            wrongPassword,
        );
    } catch (error) {
        failed = true;
    }

    console.log("\n[Wrong Password]");
    console.log("Decrypt failed correctly:", failed);

    assert.equal(failed, true);
});

test("PK and HD wallet should generate independent addresses", async () => {
    const pk = await Wallet.createPk(
        accountOptions,
        createPkProvider(PASSWORD).provider,
    );

    const hd = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions,
        pathOptions: {
            index: 0,
        },
    });

    const pkAddress = pk.getActiveAccount()?.getAddress();

    const hdAddress = hd.getActiveAccount()?.getAddress();

    console.log("\n[Wallet Type Independence]");
    console.log("PK address:", pkAddress);
    console.log("HD address:", hdAddress);
    console.log("Different:", pkAddress !== hdAddress);

    assert.notEqual(pkAddress, hdAddress);
});

test("HD wallet should update, remove account and reuse freed derivation index", async () => {
    const wallet = await Wallet.createHD(MNEMONIC, passwordProvider, {
        accountOptions: accountPayload,
        pathOptions: {
            index: 0,
        },
    });

    console.log("\n=== INITIAL WALLET ===");

    console.log(
        wallet.getAccounts().map((account) => ({
            name: account.getName(),
            index: account.getIndex(),
            address: account.getAddress(),
        })),
    );

    const account1 = await wallet.deriveAccount(
        {
            name: "Account 1",
        },
        passwordProvider,
    );

    const account2 = await wallet.deriveAccount(
        {
            name: "Account 2",
        },
        passwordProvider,
    );

    const account3 = await wallet.deriveAccount(
        {
            name: "Account 3",
        },
        passwordProvider,
    );

    console.log("\n=== AFTER DERIVATION ===");

    console.log(
        wallet.getAccounts().map((account) => ({
            name: account.getName(),
            index: account.getIndex(),
            address: account.getAddress(),
        })),
    );

    const accountsBeforeDelete = wallet
        .getAccounts()
        .map((account) => account.getIndex())
        .sort((a, b) => a! - b!);

    console.log("Indexes before delete:", accountsBeforeDelete);

    assert.deepEqual(accountsBeforeDelete, [0, 1, 2, 3]);

    //
    // UPDATE ACCOUNT 2
    //

    const account2Entry = wallet
        .getAccounts()
        .find((account) => account.getIndex() === 2);

    assert.ok(account2Entry);

    const account2Id = Array.from(wallet.getAccountsMap().entries()).find(
        ([, account]) => account === account2Entry,
    )?.[0];

    assert.ok(account2Id);

    wallet.updateAccount(account2Id, {
        name: "Updated Account 2",
    });

    console.log("\n=== AFTER UPDATE ACCOUNT 2 ===");

    console.log(
        wallet.getAccounts().map((account) => ({
            name: account.getName(),
            index: account.getIndex(),
        })),
    );

    assert.equal(
        wallet
            .getAccounts()
            .find((account) => account.getIndex() === 2)
            ?.getName(),
        "Updated Account 2",
    );

    //
    // DELETE ACCOUNT INDEX 2
    //

    const removed = wallet.removeAccount(account2Id);

    console.log("\nRemoved account:", removed);

    assert.equal(removed, true);

    const indexesAfterDelete = wallet
        .getAccounts()
        .map((account) => account.getIndex())
        .sort((a, b) => a! - b!);

    console.log("Indexes after delete:", indexesAfterDelete);

    assert.deepEqual(indexesAfterDelete, [0, 1, 3]);

    //
    // CREATE NEW ACCOUNT
    //

    const newAccount = await wallet.deriveAccount(
        {
            name: "New Account After Delete",
        },
        passwordProvider,
    );

    console.log("\nCreated account after delete:", {
        name: newAccount.getName(),
        index: newAccount.getIndex(),
        address: newAccount.getAddress(),
    });

    assert.equal(newAccount.getIndex(), 2);

    const finalIndexes = wallet
        .getAccounts()
        .map((account) => account.getIndex())
        .sort((a, b) => a! - b!);

    console.log("\nFinal indexes:", finalIndexes);

    assert.deepEqual(finalIndexes, [0, 1, 2, 3]);
});
