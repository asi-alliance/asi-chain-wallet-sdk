import test from "node:test";
import assert from "node:assert/strict";

import Client, { TTransactionReservationRequest } from "@domains/Client";
import Wallet from "@domains/Wallet";
import Account from "@domains/Account";
import StorageManager from "@services/StorageManager";
import TransactionReservationsManager from "@services/TransactionReservationsManager";
import { ITransactionReservation } from "@domains/Transaction";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { INetworkConfig, INetworkRecord, NetworkId } from "@domains/Network";
import {
    DomainClosedError,
    OperationsSuspendedError,
} from "@domains/CustomError";
import { FAKE_NETWORK, IFakeNode, IHeldStep, startFakeNode } from "./fakeNode";

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

const captureError = async (operation: () => Promise<unknown>) => {
    try {
        await operation();
    } catch (error: unknown) {
        return error;
    }

    return null;
};

const nextTurn = (): Promise<void> =>
    new Promise<void>((resolve) => setImmediate(resolve));

const createExternalReservationRequest = (
    walletId: string,
    accountId: string,
): TTransactionReservationRequest => ({
    walletId,
    accountId,
    kind: "deploy",
    deployId: "external-deploy",
    pendingAmount: 1_000n,
    gasCost: 0n,
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
    fakeNode.onBeforeSubmitResponse(async () => {});
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

test("subscribing to a closed reservations manager reports the closure", () => {
    console.log("\n=== LATE SUBSCRIBER OF A CLOSED MANAGER ===");

    const manager: TransactionReservationsManager =
        new TransactionReservationsManager([]);

    manager.close();

    const errors: Error[] = [];

    const unsubscribe: () => void = manager.subscribe("late-subscriber", {
        onError: (error: Error) => {
            errors.push(error);
        },
    });

    unsubscribe();

    console.log("    Reported errors:", errors.map((error) => error.name));

    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof DomainClosedError);
});

test("new operations are rejected while the persistence is being cleared", async () => {
    console.log("\n=== OPERATIONS SUSPENDED DURING CLEAR ===");

    const funded: IFundedWallet = await createFundedWallet();

    const heldSubmit: IHeldStep = fakeNode.holdSubmitResponse();
    const transferring: Promise<unknown> = captureError(funded.transfer);

    await heldSubmit.reached;

    const clearing: Promise<void> = funded.client.clearPersistence();

    const createError: unknown = await captureError(() =>
        funded.client.createPrivateKeyWallet(
            { privateKey, accountName: "Created while clearing" },
            PASSWORD,
        ),
    );
    const openError: unknown = await captureError(() =>
        funded.client.openWallet(funded.signerId, PASSWORD),
    );

    heldSubmit.release();

    await transferring;
    await clearing;

    console.log("    Create error:", (createError as Error).constructor.name);
    console.log("    Open error:", (openError as Error).constructor.name);

    assert.ok(createError instanceof OperationsSuspendedError);
    assert.ok(openError instanceof OperationsSuspendedError);

    const recreated: Wallet = await funded.client.createPrivateKeyWallet(
        { privateKey, accountName: "Created after clearing" },
        PASSWORD,
    );

    assert.equal(funded.client.isWalletOpen(recreated.getId()), true);
    assert.equal((await StorageManager.getSigners()).length, 1);

    await funded.client.close();
});

test("removing a wallet detaches it at once and deletes it after its in-flight submission", async () => {
    console.log("\n=== WALLET REMOVAL DURING A SUBMISSION ===");

    const funded: IFundedWallet = await createFundedWallet();

    const heldSubmit: IHeldStep = fakeNode.holdSubmitResponse();
    const transferring: Promise<unknown> = captureError(funded.transfer);

    await heldSubmit.reached;

    let isRemoved: boolean = false;

    const removing: Promise<void> = funded.client
        .removeWallet(funded.walletId)
        .then(() => {
            isRemoved = true;
        });

    await nextTurn();

    const isOpenWhileRemoving: boolean = funded.client.isWalletOpen(
        funded.walletId,
    );
    const transferError: unknown = await captureError(funded.transfer);
    const signersWhileRemoving: number = (await StorageManager.getSigners())
        .length;
    const isRemovedBeforeSettle: boolean = isRemoved;

    heldSubmit.release();

    await transferring;
    await removing;

    const storedReservations: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);

    console.log("    Open while removing:", isOpenWhileRemoving);
    console.log("    Transfer error:", (transferError as Error).constructor.name);
    console.log("    Signers while removing:", signersWhileRemoving);

    assert.equal(isOpenWhileRemoving, false);
    assert.ok(transferError instanceof OperationsSuspendedError);
    assert.equal(signersWhileRemoving, 1);
    assert.equal(isRemovedBeforeSettle, false);
    assert.equal((await StorageManager.getSigners()).length, 0);
    assert.equal(storedReservations.length, 0);

    await funded.client.close();
});

test("an external reservation cannot be moved to another account or network", async () => {
    console.log("\n=== EXTERNAL RESERVATION UPDATE TARGET ===");

    const client: Client = await createClient();

    const wallet: Wallet = await client.createHDWallet(
        { mnemonic: client.generateMnemonic(), accountName: "First" },
        PASSWORD,
    );

    const walletId: string = wallet.getId();
    const [firstAccount] = wallet.getAccounts();

    const { account: secondAccount } = await client.deriveAccount(
        walletId,
        "Second",
        PASSWORD,
    );

    await client.unlockWallet(walletId, PASSWORD);

    const reservation: ITransactionReservation =
        await client.addTransactionReservation(
            createExternalReservationRequest(walletId, firstAccount.getId()),
        );

    await assert.rejects(
        () =>
            client.updateTransactionReservation(
                reservation.id,
                createExternalReservationRequest(
                    walletId,
                    secondAccount.getId(),
                ),
            ),
        /cannot be moved to another account/,
    );

    const fakeNetworkConfig: INetworkConfig =
        fakeNode.networksConfig[FAKE_NETWORK];

    const otherNetwork: INetworkRecord = await client.addNetwork(
        "Other fake network",
        {
            ...fakeNetworkConfig,
            IndexerURL: `${fakeNetworkConfig.ValidatorURL}/other/v1/graphql`,
        },
    );

    client.setNetwork(otherNetwork.id);

    await assert.rejects(
        () =>
            client.updateTransactionReservation(
                reservation.id,
                createExternalReservationRequest(walletId, firstAccount.getId()),
            ),
        /cannot be moved to another network/,
    );

    client.setNetwork(reservation.networkId);

    const [kept] = await client.getReservations(walletId);

    console.log("    Kept account:", kept.accountId === firstAccount.getId());
    console.log("    Kept network:", kept.networkId);

    assert.equal(kept.accountId, firstAccount.getId());
    assert.equal(kept.networkId, reservation.networkId);

    await client.removeNetwork(otherNetwork.id);
    await client.close();
});
