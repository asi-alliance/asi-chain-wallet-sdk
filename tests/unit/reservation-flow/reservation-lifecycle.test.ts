import test from "node:test";
import assert from "node:assert/strict";

import Client from "@domains/Client";
import Wallet from "@domains/Wallet";
import Account from "@domains/Account";
import StorageManager from "@services/StorageManager";
import TransactionReservationsManager from "@services/TransactionReservationsManager";
import { ITransactionReservation } from "@domains/Transaction";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { NetworkId } from "@domains/Network";
import { FAKE_NETWORK, IFakeNode, startFakeNode } from "./fakeNode";

const PRIVATE_KEY_HEX =
    "7e4c2412f4694ea426d7f7adbfdfdec46fb0396b491d530a740cfa4761851d35";

const PASSWORD = "12345678";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/reservation-lifecycle" };

const BALANCE: bigint = 1_000_000_000n;
const TRANSFER_AMOUNT: bigint = 100_000_000n;

const privateKey: Uint8Array = Uint8Array.from(
    Buffer.from(PRIVATE_KEY_HEX, "hex"),
);

interface IFundedWallet {
    client: Client;
    walletId: string;
    signerId: string;
    transfer: () => Promise<unknown>;
}

let fakeNode: IFakeNode;

const createClient = (): Promise<Client> =>
    Client.create({
        networksConfig: fakeNode.networksConfig,
        defaultNetwork: FAKE_NETWORK,
        storageOptions: STORAGE_OPTIONS,
    });

const createFundedWallet = async (): Promise<IFundedWallet> => {
    const client: Client = await createClient();

    const wallet: Wallet = await client.createPrivateKeyWallet(
        { privateKey, accountName: "Funded account" },
        PASSWORD,
    );

    const account: Account = wallet.getAccounts()[0];
    const walletId: string = wallet.getId();

    await client.unlockWallet(walletId, PASSWORD);

    return {
        client,
        walletId,
        signerId: wallet.getSigner().getId(),
        transfer: () =>
            client.transfer({
                walletId,
                accountId: account.getId(),
                to: account.getAddress(),
                amount: TRANSFER_AMOUNT,
            }),
    };
};

const readStoredReservations = async (
    signerId: string,
): Promise<ITransactionReservationsStorageRecord[]> =>
    StorageManager.getTransactionReservationsBySignerId(signerId);

const createReservation = (
    id: string,
    networkId: NetworkId,
): ITransactionReservation => ({
    id,
    networkId,
    accountId: "account-id",
    pendingAmount: "1000",
    expirationTime: Date.now() + 5 * 60 * 1000,
    kind: "transfer",
    details: {
        deployId: id,
        timestamp: new Date(),
        from: "sender-address",
        to: "recipient-address",
    },
});

test.before(async () => {
    fakeNode = await startFakeNode();
});

test.after(async () => {
    await fakeNode.close();
});

test.beforeEach(() => {
    fakeNode.setBalance(BALANCE);
    fakeNode.setSubmitOutcome({ kind: "accepted" });
});

test.afterEach(async () => {
    await StorageManager.clear();
});

test("removing a wallet deletes the persisted reservations of its signer", async () => {
    console.log("\n=== REMOVING A WALLET CLEARS ITS RESERVATIONS ===");

    const funded: IFundedWallet = await createFundedWallet();

    await funded.transfer();

    const beforeRemoval: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);

    await funded.client.removeWallet(funded.walletId);

    const afterRemoval: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);

    console.log("    Stored before removal:", beforeRemoval.length);
    console.log("    Stored after removal:", afterRemoval.length);

    assert.equal(beforeRemoval.length, 1);
    assert.equal(afterRemoval.length, 0);

    await funded.client.close();
});

test("a reservation survives closing and reopening the wallet", async () => {
    console.log("\n=== RESERVATION SURVIVES A WALLET REOPEN ===");

    const funded: IFundedWallet = await createFundedWallet();

    await funded.transfer();

    funded.client.closeWallet(funded.walletId);

    const reopened: Wallet = await funded.client.openWallet(
        funded.signerId,
        PASSWORD,
    );

    const reservations: ITransactionReservation[] =
        await funded.client.getReservations(reopened.getId());

    console.log("    Reservations after reopen:", reservations.length);

    assert.equal(reservations.length, 1);

    await funded.client.close();
});

test("a closed reservations manager stops tracking new reservations", async () => {
    console.log("\n=== CLOSED MANAGER IGNORES NEW RESERVATIONS ===");

    const client: Client = await createClient();
    const networkId: NetworkId = client.getNetworks()[0].id;

    const manager: TransactionReservationsManager =
        new TransactionReservationsManager([]);

    manager.add("before-close", createReservation("before-close", networkId));

    const trackedWhileActive: number = manager.getAll().length;

    manager.close();
    manager.add("after-close", createReservation("after-close", networkId));

    console.log("    Tracked while active:", trackedWhileActive);
    console.log("    Active after close:", manager.isActive());
    console.log("    Tracked after close:", manager.getAll().length);

    assert.equal(trackedWhileActive, 1);
    assert.equal(manager.isActive(), false);
    assert.equal(manager.getAll().length, 0);

    manager.close();

    await client.close();
});
