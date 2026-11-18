import test from "node:test";
import assert from "node:assert/strict";

import { IApiClients } from "@domains/ApiClientManager";
import {
    DeployStatus,
    DeployVerdictStatus,
    IDeployStatusResult,
} from "@domains/Deploy";
import {
    CustomErrorCode,
    DeployTimeoutError,
    DeployVerdictError,
} from "@domains/CustomError";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import { INetworkConfig, INetworkContextInput } from "@domains/Network";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { createNodeApiAdapter } from "@fabrics/nodeApiAdapter";
import DeployStatusPoller from "@services/DeployStatusPoller";

const DEPLOY_ID = "deploy-id";
const VERDICT_DETAIL = "kind: why";
const POLL_INTERVAL_MS = 5;
const LONG_WATCH_TIMEOUT_MS = 60_000;
const SHORT_WATCH_TIMEOUT_MS = 30;

const NETWORK_CONFIG: INetworkConfig = {
    ValidatorURL: "http://validator.test",
    ReadOnlyURL: "http://observer.test",
    IndexerURL: "http://indexer.test/v1/graphql",
    nodeApiProfile: NodeApiProfile.RUST,
};

interface IStatusCalls {
    validator: string[];
    observer: string[];
}

interface IVerdictCase {
    state: DeployVerdictStatus;
    code: CustomErrorCode;
}

interface IObserverFallbackCase {
    name: string;
    finalization: () => Promise<unknown>;
}

const VERDICT_CASES: IVerdictCase[] = [
    {
        state: DeployStatus.REJECTED,
        code: CustomErrorCode.DEPLOY_VERDICT_REJECTED,
    },
    {
        state: DeployStatus.EXPIRED,
        code: CustomErrorCode.DEPLOY_VERDICT_EXPIRED,
    },
    {
        state: DeployStatus.FAILED,
        code: CustomErrorCode.DEPLOY_VERDICT_FAILED,
    },
];

const OBSERVER_FALLBACK_CASES: IObserverFallbackCase[] = [
    {
        name: "Pending",
        finalization: async () => ({
            state: "Pending",
            rejection_count: 0,
            latest_block_hash: null,
        }),
    },
    {
        name: "Finalized",
        finalization: async () => ({
            state: "Finalized",
            rejection_count: 0,
            latest_block_hash: "b1",
        }),
    },
    {
        name: "a node without the endpoint (404)",
        finalization: async () => {
            throw Object.assign(new Error("HTTP 404"), {
                isAxiosError: true,
                response: { status: 404, data: "" },
            });
        },
    },
    {
        name: "an unreachable validator",
        finalization: async () => {
            throw new Error("ECONNREFUSED");
        },
    },
    {
        name: "a malformed answer",
        finalization: async () => "Pending",
    },
    {
        name: "an unknown state",
        finalization: async () => ({ state: "toString" }),
    },
];

const createVerdictAnswer = (state: DeployVerdictStatus): unknown => ({
    state,
    rejection_count: 0,
    latest_block_hash: null,
    queue_state: state.toLowerCase(),
    detail: VERDICT_DETAIL,
});

const pendingInBlock = async (): Promise<unknown> => ({
    blockHash: "b1",
    faultTolerance: 0,
});

const notInBlock = async (): Promise<unknown> => ({});

const createClients = (
    finalization: () => Promise<unknown>,
    deploy: () => Promise<unknown>,
    calls: IStatusCalls = { validator: [], observer: [] },
): IApiClients =>
    ({
        validator: {
            getDeployFinalizationStatus: async (signature: string) => {
                calls.validator.push(signature);

                return finalization();
            },
        },
        observer: {
            getDeploy: async (signature: string) => {
                calls.observer.push(signature);

                return deploy();
            },
        },
        indexer: {},
    }) as unknown as IApiClients;

const createAdapter = (
    profile: NodeApiProfile,
    finalization: () => Promise<unknown>,
    deploy: () => Promise<unknown>,
    calls?: IStatusCalls,
): NodeApiAdapter =>
    createNodeApiAdapter(profile, createClients(finalization, deploy, calls));

const createPoller = (
    finalizations: Array<() => Promise<unknown>>,
): DeployStatusPoller => {
    let call: number = 0;

    const nextFinalization = (): Promise<unknown> =>
        finalizations[Math.min(call++, finalizations.length - 1)]();

    const clients: IApiClients = createClients(nextFinalization, notInBlock);

    const networkContext: INetworkContextInput = {
        networkId: "rust-test",
        name: "RustTestNet",
        config: NETWORK_CONFIG,
        clients,
        api: createNodeApiAdapter(NodeApiProfile.RUST, clients),
    };

    return new DeployStatusPoller(networkContext);
};

for (const { state } of VERDICT_CASES) {
    test(`a Rust validator verdict ${state} takes precedence over the observer status`, async () => {
        console.log(`\n=== RUST VERDICT ${state} OVER OBSERVER ===`);

        const calls: IStatusCalls = { validator: [], observer: [] };

        const result: IDeployStatusResult = await createAdapter(
            NodeApiProfile.RUST,
            async () => createVerdictAnswer(state),
            pendingInBlock,
            calls,
        ).getDeployStatus(DEPLOY_ID);

        console.log("    Status:", result);
        console.log("    Calls:", JSON.stringify(calls));

        assert.deepEqual(result, { status: state, detail: VERDICT_DETAIL });
        assert.deepEqual(calls, {
            validator: [DEPLOY_ID],
            observer: [DEPLOY_ID],
        });
    });
}

for (const { name, finalization } of OBSERVER_FALLBACK_CASES) {
    test(`with ${name} from the validator, the observer decides as before`, async () => {
        console.log(`\n=== OBSERVER DECIDES WITH ${name} ===`);

        const calls: IStatusCalls = { validator: [], observer: [] };

        const result: IDeployStatusResult = await createAdapter(
            NodeApiProfile.RUST,
            finalization,
            pendingInBlock,
            calls,
        ).getDeployStatus(DEPLOY_ID);

        console.log("    Status:", result);

        assert.deepEqual(result, { status: DeployStatus.INCLUDED_IN_BLOCK });
        assert.deepEqual(calls.observer, [DEPLOY_ID]);
    });
}

test("a verdict without detail carries no detail field", async () => {
    console.log("\n=== VERDICT WITHOUT DETAIL ===");

    const result: IDeployStatusResult = await createAdapter(
        NodeApiProfile.RUST,
        async () => ({ state: DeployStatus.EXPIRED, detail: null }),
        pendingInBlock,
    ).getDeployStatus(DEPLOY_ID);

    console.log("    Status:", result);

    assert.deepEqual(result, { status: DeployStatus.EXPIRED });
});

test("the Scala profile does not ask the validator for a verdict", async () => {
    console.log("\n=== SCALA SKIPS THE VALIDATOR VERDICT ===");

    const calls: IStatusCalls = { validator: [], observer: [] };

    await createAdapter(
        NodeApiProfile.SCALA,
        async () => createVerdictAnswer(DeployStatus.REJECTED),
        pendingInBlock,
        calls,
    ).getDeployStatus(DEPLOY_ID);

    console.log("    Calls:", JSON.stringify(calls));

    assert.deepEqual(calls.validator, []);
});

for (const { state, code } of VERDICT_CASES) {
    test(`the poller ends a watch at once on the verdict ${state}`, async () => {
        console.log(`\n=== POLLER ENDS ON VERDICT ${state} ===`);

        const seen: DeployStatus[] = [];

        const poller: DeployStatusPoller = createPoller([
            async () => ({ state: "Pending" }),
            async () => createVerdictAnswer(state),
        ]);

        const error: unknown = await poller
            .watch(
                DEPLOY_ID,
                {
                    onStatus: (result: IDeployStatusResult) => {
                        seen.push(result.status);
                    },
                },
                {
                    intervalMs: POLL_INTERVAL_MS,
                    timeoutMs: LONG_WATCH_TIMEOUT_MS,
                },
            )
            .done.catch((reason: unknown) => reason);

        console.log("    Statuses:", seen);
        console.log("    Error:", (error as Error).constructor.name);

        assert.ok(error instanceof DeployVerdictError);
        assert.equal(error.state, state);
        assert.equal(error.code, code);
        assert.equal(error.deployId, DEPLOY_ID);
        assert.equal(error.detail, VERDICT_DETAIL);
        assert.match(error.message, new RegExp(VERDICT_DETAIL));
        assert.deepEqual(seen, [DeployStatus.DEPLOYING, state]);
    });
}

test("the poller reports a verdict through onVerdict before onError", async () => {
    console.log("\n=== POLLER CALLS ON VERDICT BEFORE ON ERROR ===");

    const calls: string[] = [];

    const poller: DeployStatusPoller = createPoller([
        async () => createVerdictAnswer(DeployStatus.REJECTED),
    ]);

    await poller
        .watch(
            DEPLOY_ID,
            {
                onVerdict: (verdict: DeployVerdictError) => {
                    calls.push(`onVerdict:${verdict.state}`);
                },
                onError: (error: Error) => {
                    calls.push(`onError:${error.constructor.name}`);
                },
            },
            {
                intervalMs: POLL_INTERVAL_MS,
                timeoutMs: LONG_WATCH_TIMEOUT_MS,
            },
        )
        .done.catch(() => undefined);

    console.log("    Calls:", calls);

    assert.deepEqual(calls, [
        `onVerdict:${DeployStatus.REJECTED}`,
        "onError:DeployVerdictError",
    ]);
});

test("the poller does not call onVerdict when the watch times out", async () => {
    console.log("\n=== POLLER TIMEOUT SKIPS ON VERDICT ===");

    const calls: string[] = [];

    const poller: DeployStatusPoller = createPoller([
        async () => ({ state: "Pending" }),
    ]);

    await poller
        .watch(
            DEPLOY_ID,
            {
                onVerdict: () => {
                    calls.push("onVerdict");
                },
                onError: (error: Error) => {
                    calls.push(`onError:${error.constructor.name}`);
                },
            },
            {
                intervalMs: POLL_INTERVAL_MS,
                timeoutMs: SHORT_WATCH_TIMEOUT_MS,
            },
        )
        .done.catch(() => undefined);

    console.log("    Calls:", calls);

    assert.deepEqual(calls, ["onError:DeployTimeoutError"]);
});

test("the poller still times out while the deploy stays pending", async () => {
    console.log("\n=== POLLER TIMES OUT WHILE PENDING ===");

    const poller: DeployStatusPoller = createPoller([
        async () => ({ state: "Pending" }),
    ]);

    await assert.rejects(
        poller.waitFor(DEPLOY_ID, {
            intervalMs: POLL_INTERVAL_MS,
            timeoutMs: SHORT_WATCH_TIMEOUT_MS,
        }),
        DeployTimeoutError,
    );
});
