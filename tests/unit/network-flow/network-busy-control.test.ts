import test from "node:test";
import assert from "node:assert/strict";

import ApiClientManager from "@domains/ApiClientManager";
import NetworkBusyRegistry from "@domains/NetworkBusyRegistry";
import { CustomErrorCode, NetworkBusyError } from "@domains/CustomError";
import { INetworkRecord, NetworkId } from "@domains/Network";
import {
    CUSTOM_NETWORK_CONFIG,
    NETWORKS_CONFIG,
    RUST_NETWORK,
    SCALA_NETWORK,
} from "./networks";

interface IBusyEvent {
    networkId: NetworkId;
    isBusy: boolean;
}

interface IPendingOperation {
    done: Promise<string>;
    release: () => void;
    fail: (error: Error) => void;
}

const initApiClientManager = (): ApiClientManager => {
    const apiClientManager: ApiClientManager = ApiClientManager.getInstance();

    apiClientManager.close();
    apiClientManager.initialize(NETWORKS_CONFIG, [], SCALA_NETWORK);

    return apiClientManager;
};

const startOperation = (
    apiClientManager: ApiClientManager,
    events: IBusyEvent[] = [],
): IPendingOperation => {
    let release!: () => void;
    let fail!: (error: Error) => void;

    const gate = new Promise<string>((resolve, reject) => {
        release = () => resolve("done");
        fail = reject;
    });

    const done: Promise<string> = apiClientManager.runNetworkOperation(
        () => gate,
        (networkId: NetworkId, isBusy: boolean) =>
            events.push({ networkId, isBusy }),
    );

    return { done, release, fail };
};

const isNetworkBusyError = (
    error: unknown,
    networkId: NetworkId,
): error is NetworkBusyError =>
    error instanceof NetworkBusyError &&
    error.code === CustomErrorCode.NETWORK_BUSY &&
    error.networkId === networkId;

test("busy registry counts operations instead of flagging them", () => {
    console.log("\n=== BUSY REGISTRY IS A COUNTER ===");

    const registry: NetworkBusyRegistry = new NetworkBusyRegistry();

    console.log("    Busy before acquire:", registry.isBusy(SCALA_NETWORK));
    assert.equal(registry.isBusy(SCALA_NETWORK), false);

    registry.acquire(SCALA_NETWORK);
    registry.acquire(SCALA_NETWORK);

    console.log("    Busy after two acquires:", registry.isBusy(SCALA_NETWORK));
    assert.equal(registry.isBusy(SCALA_NETWORK), true);

    registry.release(SCALA_NETWORK);

    console.log(
        "    Busy after first release:",
        registry.isBusy(SCALA_NETWORK),
    );
    assert.equal(registry.isBusy(SCALA_NETWORK), true);

    registry.release(SCALA_NETWORK);

    console.log(
        "    Busy after second release:",
        registry.isBusy(SCALA_NETWORK),
    );
    assert.equal(registry.isBusy(SCALA_NETWORK), false);

    registry.release(SCALA_NETWORK);

    console.log("    Busy after extra release:", registry.isBusy(SCALA_NETWORK));
    assert.equal(registry.isBusy(SCALA_NETWORK), false);

    assert.equal(registry.isBusy(RUST_NETWORK), false);
});

test("running an operation marks only its own network as busy", async () => {
    console.log("\n=== OPERATION MARKS ITS NETWORK ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const operation: IPendingOperation = startOperation(apiClientManager);

    console.log(
        "    Active network busy:",
        apiClientManager.isNetworkBusy(SCALA_NETWORK),
    );
    console.log(
        "    Other network busy:",
        apiClientManager.isNetworkBusy(RUST_NETWORK),
    );

    assert.equal(apiClientManager.isNetworkBusy(SCALA_NETWORK), true);
    assert.equal(apiClientManager.isNetworkBusy(RUST_NETWORK), false);

    operation.release();
    await operation.done;

    console.log(
        "    Active network busy after finish:",
        apiClientManager.isNetworkBusy(SCALA_NETWORK),
    );

    assert.equal(apiClientManager.isNetworkBusy(SCALA_NETWORK), false);

    apiClientManager.close();
});

test("busy state is released when an operation fails", async () => {
    console.log("\n=== BUSY RELEASED ON FAILURE ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const operation: IPendingOperation = startOperation(apiClientManager);

    assert.equal(apiClientManager.isNetworkBusy(SCALA_NETWORK), true);

    operation.fail(new Error("operation failed"));

    await assert.rejects(operation.done, /operation failed/);

    console.log(
        "    Busy after rejection:",
        apiClientManager.isNetworkBusy(SCALA_NETWORK),
    );

    assert.equal(apiClientManager.isNetworkBusy(SCALA_NETWORK), false);

    apiClientManager.close();
});

test("parallel operations keep the network busy until the last one finishes", async () => {
    console.log("\n=== PARALLEL OPERATIONS ===");

    const apiClientManager: ApiClientManager = initApiClientManager();
    const events: IBusyEvent[] = [];

    const first: IPendingOperation = startOperation(apiClientManager, events);
    const second: IPendingOperation = startOperation(apiClientManager, events);

    first.release();
    await first.done;

    console.log(
        "    Busy after first finished:",
        apiClientManager.isNetworkBusy(SCALA_NETWORK),
    );
    assert.equal(apiClientManager.isNetworkBusy(SCALA_NETWORK), true);

    second.release();
    await second.done;

    console.log(
        "    Busy after second finished:",
        apiClientManager.isNetworkBusy(SCALA_NETWORK),
    );
    assert.equal(apiClientManager.isNetworkBusy(SCALA_NETWORK), false);

    console.log("    Busy events:", JSON.stringify(events));

    assert.deepEqual(
        events.map((event: IBusyEvent) => event.isBusy),
        [true, true, true, false],
    );

    apiClientManager.close();
});

test("switching away from a busy network is rejected", async () => {
    console.log("\n=== SWITCH IS BLOCKED ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const operation: IPendingOperation = startOperation(apiClientManager);

    assert.throws(
        () => apiClientManager.switchNetwork(RUST_NETWORK),
        (error: unknown) => isNetworkBusyError(error, SCALA_NETWORK),
    );

    console.log("    Switch rejected while busy");
    console.log(
        "    Network kept:",
        apiClientManager.getCurrentNetworkId(),
    );

    assert.equal(apiClientManager.getCurrentNetworkId(), SCALA_NETWORK);

    operation.release();
    await operation.done;

    apiClientManager.switchNetwork(RUST_NETWORK);

    console.log(
        "    Network after release:",
        apiClientManager.getCurrentNetworkId(),
    );

    assert.equal(apiClientManager.getCurrentNetworkId(), RUST_NETWORK);

    apiClientManager.close();
});

test("update and remove are blocked only for the busy network", async () => {
    console.log("\n=== UPDATE AND REMOVE ARE TARGET SCOPED ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const custom: INetworkRecord = apiClientManager.addNetwork(
        "Busy custom network",
        CUSTOM_NETWORK_CONFIG,
    );

    console.log("    Custom network id:", custom.id);

    const foreignOperation: IPendingOperation =
        startOperation(apiClientManager);

    apiClientManager.updateNetwork(custom.id, { name: "Renamed while idle" });

    console.log(
        "    Idle network updated while another one is busy:",
        apiClientManager.getNetwork(custom.id).name,
    );

    assert.equal(
        apiClientManager.getNetwork(custom.id).name,
        "Renamed while idle",
    );

    foreignOperation.release();
    await foreignOperation.done;

    apiClientManager.switchNetwork(custom.id);

    const customOperation: IPendingOperation = startOperation(apiClientManager);

    assert.throws(
        () => apiClientManager.updateNetwork(custom.id, { name: "Blocked" }),
        (error: unknown) => isNetworkBusyError(error, custom.id),
    );

    assert.throws(
        () => apiClientManager.removeNetwork(custom.id),
        (error: unknown) => isNetworkBusyError(error, custom.id),
    );

    console.log("    Update and remove rejected while busy");

    assert.equal(
        apiClientManager.getNetwork(custom.id).name,
        "Renamed while idle",
    );

    customOperation.release();
    await customOperation.done;

    apiClientManager.removeNetwork(custom.id);

    console.log(
        "    Networks after release:",
        apiClientManager.getNetworkIds(),
    );

    assert.equal(apiClientManager.getNetworkIds().includes(custom.id), false);

    apiClientManager.close();
});

test("busy state does not survive closing the manager", async () => {
    console.log("\n=== CLOSE CLEARS BUSY STATE ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const operation: IPendingOperation = startOperation(apiClientManager);

    assert.equal(apiClientManager.isNetworkBusy(SCALA_NETWORK), true);

    apiClientManager.close();

    console.log(
        "    Busy after close:",
        apiClientManager.isNetworkBusy(SCALA_NETWORK),
    );

    assert.equal(apiClientManager.isNetworkBusy(SCALA_NETWORK), false);

    operation.release();
    await operation.done;
});