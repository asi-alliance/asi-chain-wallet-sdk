import test from "node:test";
import assert from "node:assert/strict";

import Client, { IClientEventDispatcher } from "@domains/Client";
import Wallet from "@domains/Wallet";
import StorageManager from "@services/StorageManager";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import {
    ISerializedTransactionReservationPrivateData,
    ITransactionReservation,
    TReservationsByWallet,
} from "@domains/Transaction";
import { INetworkRecord, NetworkId } from "@domains/Network";
import SecretsProvider from "@domains/SecretsProvider";
import CryptoService, { EncryptedData } from "@services/Crypto";
import {
    CUSTOM_NETWORK_CONFIG,
    NETWORKS_CONFIG,
    RUST_NETWORK,
    SCALA_NETWORK,
} from "./networks";

const PRIVATE_KEY_HEX =
    "7e4c2412f4694ea426d7f7adbfdfdec46fb0396b491d530a740cfa4761851d35";

const PASSWORD = "12345678";

const GHOST_NETWORK: NetworkId = "ghost-network";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/network-reservations" };

const privateKey: Uint8Array = Uint8Array.from(
    Buffer.from(PRIVATE_KEY_HEX, "hex"),
);

interface IRestoredWallet {
    client: Client;
    walletId: string;
    reservationEvents: TReservationsByWallet[];
}

interface IStoredSigner {
    signerId: string;
    dataKeySecret: string;
}

const createClient = async (
    reservationEvents: TReservationsByWallet[],
): Promise<Client> => {
    const eventDispatcher: IClientEventDispatcher = {
        onReservationsChanged: (
            reservationsByWallet: TReservationsByWallet,
        ) => {
            reservationEvents.push(reservationsByWallet);
        },
    };

    return Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: SCALA_NETWORK,
        storageOptions: STORAGE_OPTIONS,
        eventDispatcher,
    });
};

const createStoredSigner = async (): Promise<IStoredSigner> => {
    const client: Client = await createClient([]);

    const wallet: Wallet = await client.createPrivateKeyWallet(
        { privateKey, accountName: "Funded account" },
        PASSWORD,
    );

    const signerId: string = wallet.getSigner().getId();

    const dataKeySecret: string = await wallet
        .getSigner()
        .resolveDataKey(new SecretsProvider(() => ({ password: PASSWORD })));

    client.close();

    return { signerId, dataKeySecret };
};

const createCustomNetwork = async (): Promise<NetworkId> => {
    const client: Client = await createClient([]);

    const custom: INetworkRecord = await client.addNetwork(
        "Removable network",
        CUSTOM_NETWORK_CONFIG,
    );

    client.close();

    return custom.id;
};

const reloadAndUnlock = async (signerId: string): Promise<IRestoredWallet> => {
    const reservationEvents: TReservationsByWallet[] = [];

    const client: Client = await createClient(reservationEvents);

    const wallet: Wallet = await client.unlockWallet(signerId, PASSWORD);

    return { client, walletId: wallet.getId(), reservationEvents };
};

const saveReservationRecord = async (
    { signerId, dataKeySecret }: IStoredSigner,
    networkId: NetworkId,
    id: string,
    expirationTime: number = Date.now() + 5 * 60 * 1000,
): Promise<void> => {
    const privateData: ISerializedTransactionReservationPrivateData = {
        accountId: "account-id",
        pendingAmount: "1000",
        expirationTime,
        transaction: {
            id,
            timestamp: new Date().toISOString(),
            type: "send",
            status: "pending",
            from: "sender-address",
            networkId,
        },
    };

    const encryptedData: EncryptedData =
        await CryptoService.encryptWithPassword(
            JSON.stringify(privateData),
            dataKeySecret,
        );

    await StorageManager.saveTransactionReservation({
        id,
        networkId,
        signerId,
        encryptedData,
    });
};

const readStoredIds = async (signerId: string): Promise<string[]> => {
    const records: ITransactionReservationsStorageRecord[] =
        await StorageManager.getTransactionReservationsBySignerId(signerId);

    return records
        .map((record: ITransactionReservationsStorageRecord) => record.id)
        .sort();
};

const toIds = (reservations: ITransactionReservation[]): string[] =>
    reservations
        .map((reservation: ITransactionReservation) => reservation.id)
        .sort();

test.afterEach(async () => {
    await StorageManager.clear();
});

test("reservations of every network are restored and read per active network", async () => {
    console.log("\n=== RESERVATIONS ARE RESTORED FOR EVERY NETWORK ===");

    const signer: IStoredSigner = await createStoredSigner();

    console.log("    Signer id:", signer.signerId);

    await saveReservationRecord(signer, SCALA_NETWORK, "scala-1");
    await saveReservationRecord(signer, RUST_NETWORK, "rust-1");
    await saveReservationRecord(signer, RUST_NETWORK, "rust-2");

    const restored: IRestoredWallet = await reloadAndUnlock(signer.signerId);

    const onScala: ITransactionReservation[] =
        await restored.client.getReservations(restored.walletId);

    console.log("    Reservations on scala network:", toIds(onScala));

    assert.deepEqual(toIds(onScala), ["scala-1"]);

    restored.client.setNetwork(RUST_NETWORK);

    const onRust: ITransactionReservation[] =
        await restored.client.getReservations(restored.walletId);

    console.log("    Reservations on rust network:", toIds(onRust));

    assert.deepEqual(toIds(onRust), ["rust-1", "rust-2"]);

    const stored: string[] = await readStoredIds(signer.signerId);

    console.log("    Stored records kept:", stored);

    assert.deepEqual(stored, ["rust-1", "rust-2", "scala-1"]);

    restored.client.close();
});

test("switching a network emits the reservations of the new network", async () => {
    console.log("\n=== SWITCH EMITS RESERVATIONS ===");

    const signer: IStoredSigner = await createStoredSigner();

    await saveReservationRecord(signer, SCALA_NETWORK, "scala-1");
    await saveReservationRecord(signer, RUST_NETWORK, "rust-1");

    const restored: IRestoredWallet = await reloadAndUnlock(signer.signerId);

    restored.reservationEvents.length = 0;

    restored.client.setNetwork(RUST_NETWORK);

    const lastEvent: TReservationsByWallet =
        restored.reservationEvents[restored.reservationEvents.length - 1];

    console.log("    Events emitted:", restored.reservationEvents.length);
    console.log(
        "    Reservations in the last event:",
        toIds(lastEvent[restored.walletId]),
    );

    assert.equal(restored.reservationEvents.length, 1);
    assert.deepEqual(toIds(lastEvent[restored.walletId]), ["rust-1"]);

    restored.client.close();
});

test("restore sweeps expired records and records of unknown networks", async () => {
    console.log("\n=== RESTORE SWEEPS STALE RECORDS ===");

    const signer: IStoredSigner = await createStoredSigner();

    await saveReservationRecord(signer, SCALA_NETWORK, "alive");
    await saveReservationRecord(signer, GHOST_NETWORK, "ghost");
    await saveReservationRecord(
        signer,
        SCALA_NETWORK,
        "expired",
        Date.now() - 1000,
    );

    console.log(
        "    Stored before restore:",
        await readStoredIds(signer.signerId),
    );

    const restored: IRestoredWallet = await reloadAndUnlock(signer.signerId);

    const storedAfterRestore: string[] = await readStoredIds(signer.signerId);

    console.log("    Stored after restore:", storedAfterRestore);

    assert.deepEqual(storedAfterRestore, ["alive"]);

    const reservations: ITransactionReservation[] =
        await restored.client.getReservations(restored.walletId);

    console.log("    Restored reservations:", toIds(reservations));

    assert.deepEqual(toIds(reservations), ["alive"]);

    restored.client.close();
});

test("removing a network clears its reservations", async () => {
    console.log("\n=== REMOVING A NETWORK CLEARS ITS RESERVATIONS ===");

    const signer: IStoredSigner = await createStoredSigner();
    const customNetworkId: NetworkId = await createCustomNetwork();

    console.log("    Custom network id:", customNetworkId);

    await saveReservationRecord(signer, SCALA_NETWORK, "scala-1");
    await saveReservationRecord(signer, customNetworkId, "custom-1");

    const restored: IRestoredWallet = await reloadAndUnlock(signer.signerId);

    console.log(
        "    Stored before removal:",
        await readStoredIds(signer.signerId),
    );

    assert.deepEqual(await readStoredIds(signer.signerId), [
        "custom-1",
        "scala-1",
    ]);

    await restored.client.removeNetwork(customNetworkId);

    const storedAfterRemoval: string[] = await readStoredIds(signer.signerId);

    console.log("    Stored after removal:", storedAfterRemoval);

    assert.deepEqual(storedAfterRemoval, ["scala-1"]);

    restored.client.setNetwork(SCALA_NETWORK);

    const remaining: ITransactionReservation[] =
        await restored.client.getReservations(restored.walletId);

    console.log("    Reservations left on scala network:", toIds(remaining));

    assert.deepEqual(toIds(remaining), ["scala-1"]);

    restored.client.close();
});

test("an idle network is never reported as busy", async () => {
    console.log("\n=== IDLE NETWORK IS NOT BUSY ===");

    const signer: IStoredSigner = await createStoredSigner();

    const restored: IRestoredWallet = await reloadAndUnlock(signer.signerId);

    console.log("    Active network busy:", restored.client.isNetworkBusy());
    console.log(
        "    Rust network busy:",
        restored.client.isNetworkBusy(RUST_NETWORK),
    );

    assert.equal(restored.client.isNetworkBusy(), false);
    assert.equal(restored.client.isNetworkBusy(RUST_NETWORK), false);

    restored.client.close();
});
