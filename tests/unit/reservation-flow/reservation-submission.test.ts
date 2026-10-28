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
    DomainClosedError,
    WalletAction,
    WalletActionInProgressError,
} from "@domains/CustomError";
import { SUBMISSION_SETTLE_TIMEOUT_MS } from "@config/index";
import { SignedResult } from "@services/Signer";
import { isRejectedByServer } from "@utils/index";
import {
    createHeldStep,
    FAKE_NETWORK,
    IFakeNode,
    IHeldStep,
    startFakeNode,
} from "./fakeNode";

const PRIVATE_KEY_HEX =
    "7e4c2412f4694ea426d7f7adbfdfdec46fb0396b491d530a740cfa4761851d35";

const PASSWORD = "12345678";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/reservation-submission" };

const BALANCE: bigint = 1_000_000_000n;
const TRANSFER_AMOUNT: bigint = 100_000_000n;
const GAS_MAX: bigint = 250_000n;
const RESERVED: bigint = TRANSFER_AMOUNT + GAS_MAX;

const RESTORE_GRACE_MS = 500;
const SETTLE_WAIT_LIMIT_MS = 15_000;

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

const originalSaveReservation = StorageManager.saveTransactionReservation;

const holdReservationSave = (): IHeldStep => {
    const step: IHeldStep = createHeldStep();

    StorageManager.saveTransactionReservation = async (
        ...args: Parameters<typeof originalSaveReservation>
    ) => {
        await step.wait();

        return originalSaveReservation(...args);
    };

    return step;
};

const nextTurn = (): Promise<void> =>
    new Promise<void>((resolve) => setImmediate(resolve));

const wait = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitUntilOpening = async (
    funded: IFundedWallet,
): Promise<void> => {
    while (
        !funded.client.getWalletManager().getBySignerId(funded.signerId)
    ) {
        await nextTurn();
    }
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
    StorageManager.saveTransactionReservation = originalSaveReservation;

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

test("an explicit node refusal of a deploy rolls its reservation back", async () => {
    console.log("\n=== EXPLICIT DEPLOY REFUSAL ROLLS BACK ===");

    const funded: IFundedWallet = await createFundedWallet();

    fakeNode.setSubmitOutcome({ kind: "refused", status: 400 });

    const error: unknown = await captureError(() =>
        funded.client.deploy({
            walletId: funded.walletId,
            accountId: funded.accountId,
            term: "Nil",
        }),
    );

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
    assert.equal(reservations.length, 0);
    assert.equal(stored.length, 0);
    assert.equal(available, BALANCE);

    await funded.client.close();
});

test("closing the wallet before the deploy reaches the node cancels the submission", async () => {
    console.log("\n=== WALLET CLOSED BEFORE THE SUBMIT ===");

    const funded: IFundedWallet = await createFundedWallet();

    const submittedBefore: number = fakeNode.getSubmittedDeploys().length;

    const heldSave: IHeldStep = holdReservationSave();
    const transferring: Promise<unknown> = captureError(funded.transfer);

    await heldSave.reached;

    funded.client.closeWallet(funded.walletId);
    heldSave.release();

    const error: unknown = await transferring;

    const stored: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);
    const submittedAfter: number = fakeNode.getSubmittedDeploys().length;

    console.log("    Error:", (error as Error).constructor.name);
    console.log("    Deploys sent to the node:", submittedAfter - submittedBefore);
    console.log("    Stored reservations:", stored.length);

    assert.ok(error instanceof DomainClosedError);
    assert.equal(submittedAfter, submittedBefore);
    assert.equal(stored.length, 0);

    await funded.client.close();
});

test("reopening a wallet waits for its in-flight submission before restoring reservations", async () => {
    console.log("\n=== REOPEN WAITS FOR THE IN-FLIGHT SUBMISSION ===");

    const funded: IFundedWallet = await createFundedWallet();

    fakeNode.setSubmitOutcome({ kind: "refused", status: 400 });

    const heldSubmit: IHeldStep = fakeNode.holdSubmitResponse();
    const transferring: Promise<unknown> = captureError(funded.transfer);

    await heldSubmit.reached;

    funded.client.closeWallet(funded.walletId);

    const reopening: Promise<Wallet> = funded.client.openWallet(
        funded.signerId,
        PASSWORD,
    );

    await waitUntilOpening(funded);
    await wait(RESTORE_GRACE_MS);

    heldSubmit.release();

    const transferError: unknown = await transferring;
    const reopened: Wallet = await reopening;

    const reservations: ITransactionReservation[] =
        await funded.client.getReservations(reopened.getId());
    const stored: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);

    console.log("    Transfer error:", (transferError as Error).constructor.name);
    console.log("    Restored reservations:", reservations.length);

    assert.ok(transferError instanceof DeploySubmissionRejectedError);
    assert.equal(reservations.length, 0);
    assert.equal(stored.length, 0);

    await funded.client.close();
});

test("reopening a wallet is refused while its submission stays unsettled past the timeout", async (t) => {
    console.log("\n=== REOPEN REFUSED FOR AN UNSETTLED SUBMISSION ===");

    const funded: IFundedWallet = await createFundedWallet();

    const heldSave: IHeldStep = holdReservationSave();
    const transferring: Promise<unknown> = captureError(funded.transfer);

    await heldSave.reached;

    funded.client.closeWallet(funded.walletId);

    t.mock.timers.enable({ apis: ["setTimeout"] });

    let isSettled: boolean = false;

    const reopening: Promise<unknown> = captureError(() =>
        funded.client.openWallet(funded.signerId, PASSWORD),
    ).finally(() => {
        isSettled = true;
    });

    const startedAt: number = performance.now();

    while (!isSettled && performance.now() - startedAt < SETTLE_WAIT_LIMIT_MS) {
        await nextTurn();
        t.mock.timers.tick(SUBMISSION_SETTLE_TIMEOUT_MS);
    }

    t.mock.timers.reset();

    const openError: unknown = await reopening;

    heldSave.release();

    const transferError: unknown = await transferring;
    const stored: ITransactionReservationsStorageRecord[] =
        await readStoredReservations(funded.signerId);

    console.log("    Open error:", (openError as Error)?.constructor.name);
    console.log("    Transfer error:", (transferError as Error).constructor.name);

    assert.ok(openError instanceof WalletActionInProgressError);
    assert.equal(
        (openError as WalletActionInProgressError).action,
        WalletAction.SUBMIT_DEPLOY,
    );
    assert.equal(
        funded.client.getWalletManager().getBySignerId(funded.signerId),
        null,
    );
    assert.ok(transferError instanceof DomainClosedError);
    assert.equal(stored.length, 0);

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
