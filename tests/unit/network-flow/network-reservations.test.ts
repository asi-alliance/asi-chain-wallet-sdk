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
import { IWalletKeyfile } from "@services/ExportKeyfileService";
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

    await client.close();

    return { signerId, dataKeySecret };
};

const createCustomNetwork = async (): Promise<NetworkId> => {
    const client: Client = await createClient([]);

    const custom: INetworkRecord = await client.addNetwork(
        "Removable network",
        CUSTOM_NETWORK_CONFIG,
    );

    await client.close();

    return custom.id;
};

const reloadAndOpen = async (signerId: string): Promise<IRestoredWallet> => {
    const reservationEvents: TReservationsByWallet[] = [];

    const client: Client = await createClient(reservationEvents);

    const wallet: Wallet = await client.openWallet(signerId, PASSWORD);

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
        kind: "transfer",
        details: {
            deployId: id,
            timestamp: new Date().toISOString(),
            from: "sender-address",
            to: "recipient-address",
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

const saveCorruptedReservationRecord = async (
    { signerId, dataKeySecret }: IStoredSigner,
    id: string,
): Promise<void> => {
    const encryptedData: EncryptedData =
        await CryptoService.encryptWithPassword("not-json", dataKeySecret);

    await StorageManager.saveTransactionReservation({
        id,
        networkId: SCALA_NETWORK,
        signerId,
        encryptedData,
    });
};

const createClientWithWalletEvents = (
    walletEvents: Wallet[][],
): Promise<Client> =>
    Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: SCALA_NETWORK,
        storageOptions: STORAGE_OPTIONS,
        eventDispatcher: {
            onWalletsChanged: (wallets: Wallet[]) => {
                walletEvents.push(wallets);
            },
        },
    });

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

const RESERVATIONS_READ_FAILURE: RegExp = /reservations storage is unavailable/;

const originalReservationsRead =
    StorageManager.getTransactionReservationsBySignerId;

const whileReservationsReadFails = async (
    action: () => Promise<unknown>,
): Promise<void> => {
    StorageManager.getTransactionReservationsBySignerId = async () => {
        throw new Error("reservations storage is unavailable");
    };

    try {
        await assert.rejects(action, RESERVATIONS_READ_FAILURE);
    } finally {
        StorageManager.getTransactionReservationsBySignerId =
            originalReservationsRead;
    }
};

const openStoredWallet = async (client: Client): Promise<Wallet> => {
    const [storedSigner] = await StorageManager.getSigners();

    return client.openWallet(storedSigner.id, PASSWORD);
};

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

    const restored: IRestoredWallet = await reloadAndOpen(signer.signerId);

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

    await restored.client.close();
});

test("switching a network emits the reservations of the new network", async () => {
    console.log("\n=== SWITCH EMITS RESERVATIONS ===");

    const signer: IStoredSigner = await createStoredSigner();

    await saveReservationRecord(signer, SCALA_NETWORK, "scala-1");
    await saveReservationRecord(signer, RUST_NETWORK, "rust-1");

    const restored: IRestoredWallet = await reloadAndOpen(signer.signerId);

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

    await restored.client.close();
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

    const restored: IRestoredWallet = await reloadAndOpen(signer.signerId);

    const storedAfterRestore: string[] = await readStoredIds(signer.signerId);

    console.log("    Stored after restore:", storedAfterRestore);

    assert.deepEqual(storedAfterRestore, ["alive"]);

    const reservations: ITransactionReservation[] =
        await restored.client.getReservations(restored.walletId);

    console.log("    Restored reservations:", toIds(reservations));

    assert.deepEqual(toIds(reservations), ["alive"]);

    await restored.client.close();
});

test("removing a network clears its reservations", async () => {
    console.log("\n=== REMOVING A NETWORK CLEARS ITS RESERVATIONS ===");

    const signer: IStoredSigner = await createStoredSigner();
    const customNetworkId: NetworkId = await createCustomNetwork();

    console.log("    Custom network id:", customNetworkId);

    await saveReservationRecord(signer, SCALA_NETWORK, "scala-1");
    await saveReservationRecord(signer, customNetworkId, "custom-1");

    const restored: IRestoredWallet = await reloadAndOpen(signer.signerId);

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

    await restored.client.close();
});

test("an idle network is never reported as busy", async () => {
    console.log("\n=== IDLE NETWORK IS NOT BUSY ===");

    const signer: IStoredSigner = await createStoredSigner();

    const restored: IRestoredWallet = await reloadAndOpen(signer.signerId);

    console.log("    Active network busy:", restored.client.isNetworkBusy());
    console.log(
        "    Rust network busy:",
        restored.client.isNetworkBusy(RUST_NETWORK),
    );

    assert.equal(restored.client.isNetworkBusy(), false);
    assert.equal(restored.client.isNetworkBusy(RUST_NETWORK), false);

    await restored.client.close();
});

test("a failed reservations restore rolls the opened wallet back out of the client", async () => {
    console.log("\n=== FAILED OPEN ROLLS BACK THE WALLET ===");

    const signer: IStoredSigner = await createStoredSigner();

    await saveCorruptedReservationRecord(signer, "corrupted");

    const walletEvents: Wallet[][] = [];
    const client: Client = await createClientWithWalletEvents(walletEvents);

    await assert.rejects(() => client.openWallet(signer.signerId, PASSWORD));

    console.log(
        "    Open wallets after the failure:",
        client.getWalletManager().getAll().length,
    );

    assert.equal(client.getWalletManager().getBySignerId(signer.signerId), null);
    assert.equal(walletEvents.length, 0);

    await client.close();
});

test("opening a wallet can be retried after a failed reservations restore", async () => {
    console.log("\n=== OPEN IS RETRIED AFTER A FAILURE ===");

    const signer: IStoredSigner = await createStoredSigner();

    await saveCorruptedReservationRecord(signer, "corrupted");

    const walletEvents: Wallet[][] = [];
    const client: Client = await createClientWithWalletEvents(walletEvents);

    await assert.rejects(() => client.openWallet(signer.signerId, PASSWORD));

    await StorageManager.deleteTransactionReservation("corrupted");

    const wallet: Wallet = await client.openWallet(signer.signerId, PASSWORD);

    console.log("    Reopened wallet unlocked:", wallet.isUnlocked());

    assert.equal(client.isWalletOpen(wallet.getId()), true);
    assert.equal(wallet.isUnlocked(), true);
    assert.equal(walletEvents.length, 1);

    await client.close();
});

test("a failed setup of a created wallet keeps it out of the client but stored", async () => {
    console.log("\n=== FAILED CREATE ROLLS BACK THE WALLET ===");

    const walletEvents: Wallet[][] = [];
    const client: Client = await createClientWithWalletEvents(walletEvents);

    await whileReservationsReadFails(() =>
        client.createPrivateKeyWallet(
            { privateKey, accountName: "Funded account" },
            PASSWORD,
        ),
    );

    console.log(
        "    Open wallets after the failure:",
        client.getWalletManager().getAll().length,
    );

    assert.equal(client.getWalletManager().getAll().length, 0);
    assert.equal(walletEvents.length, 0);

    const wallet: Wallet = await openStoredWallet(client);

    assert.equal(client.isWalletOpen(wallet.getId()), true);
    assert.equal(walletEvents.length, 1);

    await client.close();
});

test("a failed setup of an imported keyfile wallet keeps it out of the client but stored", async () => {
    console.log("\n=== FAILED KEYFILE IMPORT ROLLS BACK THE WALLET ===");

    const walletEvents: Wallet[][] = [];
    const client: Client = await createClientWithWalletEvents(walletEvents);

    const exported: Wallet = await client.createPrivateKeyWallet(
        { privateKey, accountName: "Funded account" },
        PASSWORD,
    );

    const keyfile: IWalletKeyfile = await client.exportWalletKeyfile(
        exported.getId(),
        PASSWORD,
    );

    await client.removeWallet(exported.getId());

    walletEvents.length = 0;

    await whileReservationsReadFails(() =>
        client.importWalletKeyfile(keyfile, PASSWORD),
    );

    console.log(
        "    Open wallets after the failure:",
        client.getWalletManager().getAll().length,
    );

    assert.equal(client.getWalletManager().getAll().length, 0);
    assert.equal(walletEvents.length, 0);

    const wallet: Wallet = await openStoredWallet(client);

    assert.equal(client.isWalletOpen(wallet.getId()), true);
    assert.equal(walletEvents.length, 1);

    await client.close();
});
