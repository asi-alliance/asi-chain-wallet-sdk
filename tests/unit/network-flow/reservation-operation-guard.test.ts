import test from "node:test";
import assert from "node:assert/strict";

import ReservationOperationGuardService from "@services/ReservationOperationGuard";
import {
    CustomErrorCode,
    ReservationAction,
    ReservationActionInProgressError,
} from "@domains/CustomError";
import { NetworkId } from "@domains/Network";
import { RUST_NETWORK, SCALA_NETWORK } from "./networks";

const FIRST_ACCOUNT = "account-1";
const SECOND_ACCOUNT = "account-2";

interface IPendingAction {
    done: Promise<string>;
    release: () => void;
}

const createGate = (): { gate: Promise<string>; release: () => void } => {
    let release!: () => void;

    const gate = new Promise<string>((resolve) => {
        release = () => resolve("done");
    });

    return { gate, release };
};

const startReservationAction = (
    guard: ReservationOperationGuardService,
    action: ReservationAction,
    accountId: string,
    networkId: NetworkId,
): IPendingAction => {
    const { gate, release } = createGate();

    const done: Promise<string> = guard.runReservationAction(
        action,
        { accountId, networkId },
        () => gate,
    );

    return { done, release };
};

const startNetworkCleanup = (
    guard: ReservationOperationGuardService,
    networkId: NetworkId,
): IPendingAction => {
    const { gate, release } = createGate();

    const done: Promise<string> = guard.runNetworkReservationAction(
        ReservationAction.NETWORK_CLEANUP,
        networkId,
        () => gate,
    );

    return { done, release };
};

const isActionInProgressError = (
    error: unknown,
    action: ReservationAction,
): error is ReservationActionInProgressError =>
    error instanceof ReservationActionInProgressError &&
    error.code === CustomErrorCode.RESERVATION_ACTION_IN_PROGRESS &&
    error.action === action;

test("reservation actions of different accounts share the network scope", async () => {
    console.log("\n=== SHARED SCOPE KEEPS ACCOUNTS PARALLEL ===");

    const guard: ReservationOperationGuardService =
        new ReservationOperationGuardService();

    const first: IPendingAction = startReservationAction(
        guard,
        ReservationAction.ADD,
        FIRST_ACCOUNT,
        SCALA_NETWORK,
    );
    const second: IPendingAction = startReservationAction(
        guard,
        ReservationAction.TRANSFER,
        SECOND_ACCOUNT,
        SCALA_NETWORK,
    );

    first.release();
    second.release();

    console.log("    Both actions accepted on the same network");

    assert.equal(await first.done, "done");
    assert.equal(await second.done, "done");
});

test("reservation actions of one account still conflict by key", async () => {
    console.log("\n=== ACCOUNT KEY STILL ARBITRATES ===");

    const guard: ReservationOperationGuardService =
        new ReservationOperationGuardService();

    const running: IPendingAction = startReservationAction(
        guard,
        ReservationAction.ADD,
        FIRST_ACCOUNT,
        SCALA_NETWORK,
    );

    await assert.rejects(
        guard.runReservationAction(
            ReservationAction.UPDATE,
            { accountId: FIRST_ACCOUNT, networkId: SCALA_NETWORK },
            async () => "second",
        ),
        (error: unknown) =>
            isActionInProgressError(error, ReservationAction.ADD),
    );

    console.log("    Second action of the same account rejected");

    running.release();

    assert.equal(await running.done, "done");
});

test("network cleanup cannot start while a reservation action is running", async () => {
    console.log("\n=== CLEANUP CANNOT ERASE A RUNNING ACTION ===");

    const guard: ReservationOperationGuardService =
        new ReservationOperationGuardService();

    const transfer: IPendingAction = startReservationAction(
        guard,
        ReservationAction.TRANSFER,
        FIRST_ACCOUNT,
        SCALA_NETWORK,
    );

    let isCleanupExecuted: boolean = false;

    await assert.rejects(
        guard.runNetworkReservationAction(
            ReservationAction.NETWORK_CLEANUP,
            SCALA_NETWORK,
            async () => {
                isCleanupExecuted = true;
            },
        ),
        (error: unknown) =>
            isActionInProgressError(error, ReservationAction.TRANSFER),
    );

    console.log("    Cleanup rejected, executed:", isCleanupExecuted);

    assert.equal(isCleanupExecuted, false);

    transfer.release();

    assert.equal(await transfer.done, "done");
});

test("a reservation action cannot start while network cleanup is running", async () => {
    console.log("\n=== CLEANUP BLOCKS NEW RESERVATIONS ===");

    const guard: ReservationOperationGuardService =
        new ReservationOperationGuardService();

    const cleanup: IPendingAction = startNetworkCleanup(guard, SCALA_NETWORK);

    let isReservationCreated: boolean = false;

    await assert.rejects(
        guard.runReservationAction(
            ReservationAction.ADD,
            { accountId: FIRST_ACCOUNT, networkId: SCALA_NETWORK },
            async () => {
                isReservationCreated = true;
            },
        ),
        (error: unknown) =>
            isActionInProgressError(error, ReservationAction.NETWORK_CLEANUP),
    );

    console.log(
        "    Add rejected during cleanup, executed:",
        isReservationCreated,
    );

    assert.equal(isReservationCreated, false);

    cleanup.release();

    assert.equal(await cleanup.done, "done");
});

test("two network cleanups of one network exclude each other", async () => {
    console.log("\n=== EXCLUSIVE SCOPE IS SINGLE HOLDER ===");

    const guard: ReservationOperationGuardService =
        new ReservationOperationGuardService();

    const cleanup: IPendingAction = startNetworkCleanup(guard, SCALA_NETWORK);

    await assert.rejects(
        guard.runNetworkReservationAction(
            ReservationAction.NETWORK_CLEANUP,
            SCALA_NETWORK,
            async () => "second",
        ),
        (error: unknown) =>
            isActionInProgressError(error, ReservationAction.NETWORK_CLEANUP),
    );

    console.log("    Second cleanup of the same network rejected");

    cleanup.release();

    assert.equal(await cleanup.done, "done");
});

test("network cleanup blocks only its own network", async () => {
    console.log("\n=== CLEANUP IS NETWORK SCOPED ===");

    const guard: ReservationOperationGuardService =
        new ReservationOperationGuardService();

    const cleanup: IPendingAction = startNetworkCleanup(guard, SCALA_NETWORK);
    const foreignAdd: IPendingAction = startReservationAction(
        guard,
        ReservationAction.ADD,
        FIRST_ACCOUNT,
        RUST_NETWORK,
    );

    foreignAdd.release();
    cleanup.release();

    console.log("    Action on another network accepted during cleanup");

    assert.equal(await foreignAdd.done, "done");
    assert.equal(await cleanup.done, "done");
});

test("scopes are released after a failed operation", async () => {
    console.log("\n=== FAILURE RELEASES THE SCOPE ===");

    const guard: ReservationOperationGuardService =
        new ReservationOperationGuardService();

    await assert.rejects(
        guard.runNetworkReservationAction(
            ReservationAction.NETWORK_CLEANUP,
            SCALA_NETWORK,
            async () => {
                throw new Error("cleanup failed");
            },
        ),
        /cleanup failed/,
    );

    const addResult: string = await guard.runReservationAction(
        ReservationAction.ADD,
        { accountId: FIRST_ACCOUNT, networkId: SCALA_NETWORK },
        async () => "done",
    );

    const cleanupResult: string = await guard.runNetworkReservationAction(
        ReservationAction.NETWORK_CLEANUP,
        SCALA_NETWORK,
        async () => "done",
    );

    console.log("    Add after failure:", addResult);
    console.log("    Cleanup after failure:", cleanupResult);

    assert.equal(addResult, "done");
    assert.equal(cleanupResult, "done");
});

test("a released shared holder no longer blocks network cleanup", async () => {
    console.log("\n=== SHARED HOLDER IS FULLY RELEASED ===");

    const guard: ReservationOperationGuardService =
        new ReservationOperationGuardService();

    const first: IPendingAction = startReservationAction(
        guard,
        ReservationAction.ADD,
        FIRST_ACCOUNT,
        SCALA_NETWORK,
    );
    const second: IPendingAction = startReservationAction(
        guard,
        ReservationAction.ADD,
        SECOND_ACCOUNT,
        SCALA_NETWORK,
    );

    first.release();

    await first.done;

    await assert.rejects(
        guard.runNetworkReservationAction(
            ReservationAction.NETWORK_CLEANUP,
            SCALA_NETWORK,
            async () => "blocked",
        ),
        (error: unknown) =>
            isActionInProgressError(error, ReservationAction.ADD),
    );

    console.log("    Cleanup still blocked by the second holder");

    second.release();

    await second.done;

    const cleanupResult: string = await guard.runNetworkReservationAction(
        ReservationAction.NETWORK_CLEANUP,
        SCALA_NETWORK,
        async () => "done",
    );

    console.log("    Cleanup after the last holder finished:", cleanupResult);

    assert.equal(cleanupResult, "done");
});