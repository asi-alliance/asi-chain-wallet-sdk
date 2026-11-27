import test from "node:test";
import assert from "node:assert/strict";
import { InternalAxiosRequestConfig } from "axios";

import { DEPLOY_VERDICT_REQUEST_TIMEOUT } from "@config/index";
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
import ValidatorClient from "@domains/ValidatorClient";
import { DeployFinalizationState } from "@domains/NodeApiAdapter/Rust";
import { INetworkConfig, INetworkContextInput } from "@domains/Network";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { createNodeApiAdapter } from "@fabrics/nodeApiAdapter";
import DeployStatusPoller, {
    IDeployConfirmedResult,
    IDeployWatchHandle,
} from "@services/DeployStatusPoller";

const DEPLOY_ID = "deploy-id";
const VERDICT_DETAIL = "kind: why";
const POLL_INTERVAL_MS = 5;
const LONG_WATCH_TIMEOUT_MS = 60_000;
const SHORT_WATCH_TIMEOUT_MS = 30;
const STALLED_WATCH_TEST_TIMEOUT_MS = 2_000;
const OVERFLOWING_TIMER_DELAY_MS = 2 ** 31;

const UNBOUNDED_WATCH_TIMEOUTS: number[] = [
    OVERFLOWING_TIMER_DELAY_MS,
    Infinity,
];

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

interface IObservedTerminalCase {
    state: DeployFinalizationState;
    status: DeployStatus;
}

interface IObserverFallbackCase {
    name: string;
    finalization: () => Promise<unknown>;
}

interface IValidatorTimeoutCase {
    configured: number;
    expected: number;
}

const VALIDATOR_TIMEOUT_CASES: IValidatorTimeoutCase[] = [
    { configured: 30_000, expected: DEPLOY_VERDICT_REQUEST_TIMEOUT },
    { configured: 100, expected: 100 },
    { configured: 0, expected: DEPLOY_VERDICT_REQUEST_TIMEOUT },
];

const VALIDATOR_VERDICT_CASES: IVerdictCase[] = [
    {
        state: DeployStatus.REJECTED,
        code: CustomErrorCode.DEPLOY_VERDICT_REJECTED,
    },
    {
        state: DeployStatus.EXPIRED,
        code: CustomErrorCode.DEPLOY_VERDICT_EXPIRED,
    },
];

const IN_CHAIN_VALIDATOR_STATES: string[] = ["Finalized", DeployStatus.FAILED];

const OBSERVED_TERMINAL_CASES: IObservedTerminalCase[] = [
    {
        state: DeployFinalizationState.FINALIZED,
        status: DeployStatus.FINALIZED,
    },
    {
        state: DeployFinalizationState.FAILED,
        status: DeployStatus.FAILED,
    },
    {
        state: DeployFinalizationState.EXPIRED,
        status: DeployStatus.EXPIRED,
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

const observedInBlock = (state: DeployFinalizationState): unknown => ({
    blockHash: "b1",
    faultTolerance: 0,
    finalizationState: state,
});

const neverAnswers = (): Promise<unknown> => new Promise<unknown>(() => {});

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
    deploy: () => Promise<unknown> = notInBlock,
): DeployStatusPoller => {
    let call: number = 0;

    const nextFinalization = (): Promise<unknown> =>
        finalizations[Math.min(call++, finalizations.length - 1)]();

    const clients: IApiClients = createClients(nextFinalization, deploy);

    const networkContext: INetworkContextInput = {
        networkId: "rust-test",
        name: "RustTestNet",
        config: NETWORK_CONFIG,
        clients,
        api: createNodeApiAdapter(NodeApiProfile.RUST, clients),
    };

    return new DeployStatusPoller(networkContext);
};

for (const { state } of VALIDATOR_VERDICT_CASES) {
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

for (const { configured, expected } of VALIDATOR_TIMEOUT_CASES) {
    test(`a validator probe with the client timeout ${configured} waits ${expected} ms and keeps the observer status`, async () => {
        console.log(`\n=== VALIDATOR PROBE TIMEOUT ${configured} ===`);

        const timeouts: Array<number | undefined> = [];

        const validator: ValidatorClient = new ValidatorClient({
            baseUrl: NETWORK_CONFIG.ValidatorURL,
            axiosConfig: {
                timeout: configured,
                adapter: async (config: InternalAxiosRequestConfig) => {
                    timeouts.push(config.timeout);

                    throw new Error("Validator probe timed out");
                },
            },
        });

        const api: NodeApiAdapter = createNodeApiAdapter(NodeApiProfile.RUST, {
            ...createClients(neverAnswers, pendingInBlock),
            validator,
        });

        const result: IDeployStatusResult =
            await api.getDeployStatus(DEPLOY_ID);

        console.log("    Status:", result);
        console.log("    Timeouts:", timeouts);

        assert.deepEqual(result, { status: DeployStatus.INCLUDED_IN_BLOCK });
        assert.deepEqual(timeouts, [expected]);
    });
}

test("a finalized observer answer is reported while the validator stalls", async () => {
    console.log("\n=== OBSERVER FINALIZED WHILE VALIDATOR STALLS ===");

    const result: IDeployStatusResult = await createAdapter(
        NodeApiProfile.RUST,
        neverAnswers,
        async () => observedInBlock(DeployFinalizationState.FINALIZED),
    ).getDeployStatus(DEPLOY_ID);

    console.log("    Status:", result);

    assert.deepEqual(result, { status: DeployStatus.FINALIZED });
});

test("a validator verdict is reported while the observer stalls", async () => {
    console.log("\n=== VALIDATOR VERDICT WHILE OBSERVER STALLS ===");

    const result: IDeployStatusResult = await createAdapter(
        NodeApiProfile.RUST,
        async () => createVerdictAnswer(DeployStatus.REJECTED),
        neverAnswers,
    ).getDeployStatus(DEPLOY_ID);

    console.log("    Status:", result);

    assert.deepEqual(result, {
        status: DeployStatus.REJECTED,
        detail: VERDICT_DETAIL,
    });
});

for (const { state, status } of OBSERVED_TERMINAL_CASES) {
    test(`an observer finalization state ${state} is terminal while the validator is pending`, async () => {
        console.log(`\n=== OBSERVER ${state} WITH A PENDING VALIDATOR ===`);

        const result: IDeployStatusResult = await createAdapter(
            NodeApiProfile.RUST,
            async () => ({ state: "Pending" }),
            async () => observedInBlock(state),
        ).getDeployStatus(DEPLOY_ID);

        console.log("    Status:", result);

        assert.deepEqual(result, { status });
    });
}

for (const state of IN_CHAIN_VALIDATOR_STATES) {
    test(`a validator ${state} answer waits for the observer block`, async () => {
        console.log(`\n=== VALIDATOR ${state} WITHOUT AN OBSERVER BLOCK ===`);

        const result: IDeployStatusResult = await createAdapter(
            NodeApiProfile.RUST,
            async () => ({ state, detail: VERDICT_DETAIL }),
            notInBlock,
        ).getDeployStatus(DEPLOY_ID);

        console.log("    Status:", result);

        assert.deepEqual(result, { status: DeployStatus.DEPLOYING });
    });
}

test("a validator Failed answer ends the watch once the observer reports it", async () => {
    console.log("\n=== VALIDATOR FAILED WAITS FOR THE OBSERVER ===");

    const seen: DeployStatus[] = [];

    let observerCalls: number = 0;

    const poller: DeployStatusPoller = createPoller(
        [async () => createVerdictAnswer(DeployStatus.FAILED)],
        async () =>
            observerCalls++ === 0
                ? pendingInBlock()
                : observedInBlock(DeployFinalizationState.FAILED),
    );

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
    assert.equal(error.code, CustomErrorCode.DEPLOY_VERDICT_FAILED);
    assert.equal(error.detail, undefined);
    assert.deepEqual(seen, [
        DeployStatus.INCLUDED_IN_BLOCK,
        DeployStatus.FAILED,
    ]);
});

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

for (const { state, code } of VALIDATOR_VERDICT_CASES) {
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

test("an included then expired deploy ends the watch with the expired verdict message", async () => {
    console.log("\n=== INCLUDED THEN EXPIRED DEPLOY ===");

    const poller: DeployStatusPoller = createPoller(
        [async () => ({ state: "Pending" })],
        async () => observedInBlock(DeployFinalizationState.EXPIRED),
    );

    const error: unknown = await poller
        .watch(
            DEPLOY_ID,
            {},
            {
                intervalMs: POLL_INTERVAL_MS,
                timeoutMs: LONG_WATCH_TIMEOUT_MS,
            },
        )
        .done.catch((reason: unknown) => reason);

    console.log("    Error:", (error as Error).message);

    assert.ok(error instanceof DeployVerdictError);
    assert.equal(error.code, CustomErrorCode.DEPLOY_VERDICT_EXPIRED);
    assert.equal(error.detail, undefined);
    assert.equal(
        error.message,
        `Deploy ${DEPLOY_ID} expired without its effects reaching finalized state`,
    );
});

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

test("a throwing onVerdict still ends the watch with the verdict", async () => {
    console.log("\n=== THROWING ON VERDICT ENDS THE WATCH ===");

    const calls: string[] = [];

    const poller: DeployStatusPoller = createPoller([
        async () => createVerdictAnswer(DeployStatus.EXPIRED),
    ]);

    const error: unknown = await poller
        .watch(
            DEPLOY_ID,
            {
                onVerdict: () => {
                    calls.push("onVerdict");

                    throw new Error("Subscriber failure");
                },
                onError: (reason: Error) => {
                    calls.push(`onError:${reason.constructor.name}`);
                },
            },
            {
                intervalMs: POLL_INTERVAL_MS,
                timeoutMs: LONG_WATCH_TIMEOUT_MS,
            },
        )
        .done.catch((reason: unknown) => reason);

    console.log("    Calls:", calls);
    console.log("    Error:", (error as Error).constructor.name);

    assert.deepEqual(calls, ["onVerdict", "onError:DeployVerdictError"]);
    assert.ok(error instanceof DeployVerdictError);
    assert.equal(error.state, DeployStatus.EXPIRED);
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

test(
    "a stalled watch reaches its deadline and ignores a late finalization",
    { timeout: STALLED_WATCH_TEST_TIMEOUT_MS },
    async () => {
        console.log("\n=== STALLED WATCH REACHES ITS DEADLINE ===");

        const events: string[] = [];

        let finishObserver!: (answer: unknown) => void;

        const observerAnswer: Promise<unknown> = new Promise<unknown>(
            (resolve) => {
                finishObserver = resolve;
            },
        );

        const handle: IDeployWatchHandle = createPoller(
            [neverAnswers],
            () => observerAnswer,
        ).watch(
            DEPLOY_ID,
            {
                onStatus: (result: IDeployStatusResult) => {
                    events.push(result.status);
                },
                onConfirmed: () => {
                    events.push("onConfirmed");
                },
                onError: (error: Error) => {
                    events.push(error.constructor.name);
                },
            },
            {
                intervalMs: POLL_INTERVAL_MS,
                timeoutMs: SHORT_WATCH_TIMEOUT_MS,
            },
        );

        await assert.rejects(handle.done, DeployTimeoutError);

        finishObserver(observedInBlock(DeployFinalizationState.FINALIZED));

        await new Promise<void>((resolve) => setImmediate(resolve));

        console.log("    Events:", events);

        assert.deepEqual(events, ["DeployTimeoutError"]);
    },
);

for (const timeoutMs of UNBOUNDED_WATCH_TIMEOUTS) {
    test(`a watch with the timeout ${timeoutMs} ms still observes the confirmation`, async () => {
        console.log(`\n=== WATCH WITH THE TIMEOUT ${timeoutMs} ===`);

        const poller: DeployStatusPoller = createPoller(
            [neverAnswers],
            async () => {
                await new Promise<void>((resolve) =>
                    setTimeout(resolve, POLL_INTERVAL_MS),
                );

                return observedInBlock(DeployFinalizationState.FINALIZED);
            },
        );

        const result: IDeployConfirmedResult = await poller.waitFor(
            DEPLOY_ID,
            { timeoutMs },
        );

        console.log("    Result:", result);

        assert.deepEqual(result, { deployId: DEPLOY_ID });
    });
}

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
