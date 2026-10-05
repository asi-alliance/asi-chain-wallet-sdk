import test from "node:test";
import assert from "node:assert/strict";

import Client from "@domains/Client";
import Wallet from "@domains/Wallet";
import Account from "@domains/Account";
import StorageManager from "@services/StorageManager";
import { IReservedOperationResult } from "@domains/ReservationAdapter";
import { ITransactionReservation } from "@domains/Transaction";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import {
    ApiRequestError,
    CustomErrorCode,
    DeploySubmissionRejectedError,
} from "@domains/CustomError";
import { SignedResult } from "@services/Signer";
import { isRejectedByServer } from "@utils/index";
import { FAKE_NETWORK, IFakeNode, startFakeNode } from "./fakeNode";

const PRIVATE_KEY_HEX =
    "7e4c2412f4694ea426d7f7adbfdfdec46fb0396b491d530a740cfa4761851d35";

const PASSWORD = "12345678";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/reservation-submission" };

const BALANCE: bigint = 1_000_000_000n;
const TRANSFER_AMOUNT: bigint = 100_000_000n;
const GAS_MAX: bigint = 250_000n;
const RESERVED: bigint = TRANSFER_AMOUNT + GAS_MAX;

const privateKey: Uint8Array = Uint8Array.from(
    Buffer.from(PRIVATE_KEY_HEX, "hex"),
);

interface IFundedWallet {
    client: Client;
    walletId: string;
    accountId: string;
    signerId: string;
    transfer: () => Promise<IReservedOperationResult>;
}

let fakeNode: IFakeNode;

const createFundedWallet = async (): Promise<IFundedWallet> => {
    const client: Client = await Client.create({
        networksConfig: fakeNode.networksConfig,
        defaultNetwork: FAKE_NETWORK,
        storageOptions: STORAGE_OPTIONS,
    });

    const wallet: Wallet = await client.createPrivateKeyWallet(
        { privateKey, accountName: "Funded account" },
        PASSWORD,
    );

    const account: Account = wallet.getAccounts()[0];
    const walletId: string = wallet.getId();
    const accountId: string = account.getId();

    await client.unlockWallet(walletId, PASSWORD);

    return {
        client,
        walletId,
        accountId,
        signerId: wallet.getSigner().getId(),
        transfer: () =>
            client.transfer({
                walletId,
                accountId,
                to: account.getAddress(),
                amount: TRANSFER_AMOUNT,
            }),
    };
};

const readStoredReservations = async (
    signerId: string,
): Promise<ITransactionReservationsStorageRecord[]> =>
    StorageManager.getTransactionReservationsBySignerId(signerId);

const captureError = async (operation: () => Promise<unknown>) => {
    try {
        await operation();
    } catch (error: unknown) {
        return error;
    }

    return null;
};

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

test("the reservation is persisted before the deploy is submitted", async () => {
    console.log("\n=== RESERVATION IS PERSISTED BEFORE SUBMIT ===");

    const funded: IFundedWallet = await createFundedWallet();

    let storedAtSubmitTime: number = -1;

    fakeNode.onBeforeSubmitResponse(async () => {
        const records: ITransactionReservationsStorageRecord[] =
            await readStoredReservations(funded.signerId);

        storedAtSubmitTime = records.length;
    });

    await funded.transfer();

    console.log("    Stored reservations seen by the node:", storedAtSubmitTime);

    assert.equal(storedAtSubmitTime, 1);

    await funded.client.close();
});

test("the deploy id is the local signature, known before the node answers", async () => {
    console.log("\n=== DEPLOY ID COMES FROM THE SIGNATURE ===");

    const funded: IFundedWallet = await createFundedWallet();

    const result: IReservedOperationResult = await funded.transfer();
    const submitted: SignedResult[] = fakeNode.getSubmittedDeploys();
    const signature: string = submitted[submitted.length - 1].signature;

    console.log("    Returned deploy id:", result.deployId);

    assert.equal(result.deployId, signature);

    await funded.client.close();
});

test("a successful submit keeps the reservation live and holds the funds", async () => {
    console.log("\n=== SUCCESSFUL SUBMIT HOLDS THE FUNDS ===");

    const funded: IFundedWallet = await createFundedWallet();

    await funded.transfer();

    const reservations: ITransactionReservation[] =
        await funded.client.getReservations(funded.walletId);
    const available: bigint = await funded.client.getAvailableBalance(
        funded.walletId,
        funded.accountId,
    );
    const stored: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);

    console.log("    Reservations in memory:", reservations.length);
    console.log("    Available balance:", available);

    assert.equal(reservations.length, 1);
    assert.equal(stored.length, 1);
    assert.equal(available, BALANCE - RESERVED);

    await funded.client.close();
});

test("an explicit node refusal rolls the reservation back", async () => {
    console.log("\n=== EXPLICIT REFUSAL ROLLS BACK ===");

    const funded: IFundedWallet = await createFundedWallet();

    fakeNode.setSubmitOutcome({ kind: "refused", status: 400 });

    const error: unknown = await captureError(funded.transfer);

    const reservations: ITransactionReservation[] =
        await funded.client.getReservations(funded.walletId);
    const stored: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);
    const available: bigint = await funded.client.getAvailableBalance(
        funded.walletId,
        funded.accountId,
    );

    console.log("    Error:", (error as Error).constructor.name);
    console.log("    Reservations left:", reservations.length);
    console.log("    Available balance:", available);

    assert.ok(error instanceof DeploySubmissionRejectedError);
    assert.equal(
        (error as DeploySubmissionRejectedError).code,
        CustomErrorCode.DEPLOY_SUBMISSION_REJECTED,
    );
    assert.equal(reservations.length, 0);
    assert.equal(stored.length, 0);
    assert.equal(available, BALANCE);

    await funded.client.close();
});

test("a dropped connection keeps the reservation and the held funds", async () => {
    console.log("\n=== DROPPED CONNECTION KEEPS THE RESERVATION ===");

    const funded: IFundedWallet = await createFundedWallet();

    fakeNode.setSubmitOutcome({ kind: "dropped" });

    const error: unknown = await captureError(funded.transfer);

    const reservations: ITransactionReservation[] =
        await funded.client.getReservations(funded.walletId);
    const stored: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);
    const available: bigint = await funded.client.getAvailableBalance(
        funded.walletId,
        funded.accountId,
    );

    console.log("    Error:", (error as Error).constructor.name);
    console.log("    Reservations left:", reservations.length);
    console.log("    Available balance:", available);

    assert.ok(error instanceof ApiRequestError);
    assert.ok(!(error instanceof DeploySubmissionRejectedError));
    assert.equal(reservations.length, 1);
    assert.equal(stored.length, 1);
    assert.equal(available, BALANCE - RESERVED);

    await funded.client.close();
});

test("a node failure without a verdict keeps the reservation", async () => {
    console.log("\n=== SERVER ERROR KEEPS THE RESERVATION ===");

    const funded: IFundedWallet = await createFundedWallet();

    fakeNode.setSubmitOutcome({ kind: "unavailable", status: 503 });

    const error: unknown = await captureError(funded.transfer);

    const reservations: ITransactionReservation[] =
        await funded.client.getReservations(funded.walletId);
    const stored: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);

    console.log("    Error:", (error as Error).constructor.name);
    console.log("    Reservations left:", reservations.length);

    assert.ok(!(error instanceof DeploySubmissionRejectedError));
    assert.equal(reservations.length, 1);
    assert.equal(stored.length, 1);

    await funded.client.close();
});

test("only a client-side status counts as a refusal by the server", () => {
    console.log("\n=== SUBMIT FAILURE CLASSIFICATION ===");

    const withResponse = (status: number): unknown =>
        Object.assign(new Error("request failed"), {
            isAxiosError: true,
            response: { status },
        });

    const withoutResponse: unknown = Object.assign(new Error("socket hang up"), {
        isAxiosError: true,
    });

    console.log("    400:", isRejectedByServer(withResponse(400)));
    console.log("    503:", isRejectedByServer(withResponse(503)));
    console.log("    no response:", isRejectedByServer(withoutResponse));

    assert.equal(isRejectedByServer(withResponse(400)), true);
    assert.equal(isRejectedByServer(withResponse(422)), true);
    assert.equal(isRejectedByServer(withResponse(500)), false);
    assert.equal(isRejectedByServer(withResponse(503)), false);
    assert.equal(isRejectedByServer(withoutResponse), false);
    assert.equal(isRejectedByServer(new Error("plain")), false);
});
