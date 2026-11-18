import test from "node:test";
import assert from "node:assert/strict";

import { IApiClients } from "@domains/ApiClientManager";
import { DeployStatus, IDeployStatusResult } from "@domains/Deploy";
import { CustomErrorCode, DeployTimeoutError, DeployVerdictError } from "@domains/CustomError";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import { INetworkContextInput } from "@domains/Network";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { createNodeApiAdapter } from "@fabrics/nodeApiAdapter";
import DeployStatusPoller from "@services/DeployStatusPoller";

interface IStatusCalls {
    validator: string[];
    observer: string[];
}

const httpError = (status: number) =>
    Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data: "" } });

const adapter = (
    profile: NodeApiProfile,
    finalization: () => Promise<unknown>,
    deploy: () => Promise<unknown>,
    calls: IStatusCalls = { validator: [], observer: [] },
): NodeApiAdapter =>
    createNodeApiAdapter(profile, {
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
    } as unknown as IApiClients);

const pendingInBlock = async () => ({ blockHash: "b1", faultTolerance: 0 });

for (const [state, status] of [
    ["Rejected", DeployStatus.REJECTED],
    ["Expired", DeployStatus.EXPIRED],
    ["Failed", DeployStatus.FAILED],
] as const) {
    test(`a Rust validator verdict ${state} is reported before the observer is asked`, async () => {
        const calls: IStatusCalls = { validator: [], observer: [] };
        const api = adapter(
            NodeApiProfile.RUST,
            async () => ({ state, rejection_count: 0, latest_block_hash: null, queue_state: state.toLowerCase(), detail: "kind: why" }),
            pendingInBlock,
            calls,
        );
        assert.deepEqual(await api.getDeployStatus("sig"), { status, detail: "kind: why" });
        assert.deepEqual(calls, { validator: ["sig"], observer: [] });
    });
}

for (const [name, finalization] of [
    ["Pending", async () => ({ state: "Pending", rejection_count: 0, latest_block_hash: null })],
    ["Finalized", async () => ({ state: "Finalized", rejection_count: 0, latest_block_hash: "b1" })],
    ["a node without the endpoint (404)", async () => { throw httpError(404); }],
    ["an unreachable validator", async () => { throw new Error("ECONNREFUSED"); }],
    ["a malformed answer", async () => "Pending"],
    ["an unknown state", async () => ({ state: "toString" })],
] as const) {
    test(`with ${name} from the validator, the observer decides as before`, async () => {
        const calls: IStatusCalls = { validator: [], observer: [] };
        const api = adapter(NodeApiProfile.RUST, finalization, pendingInBlock, calls);
        assert.deepEqual(await api.getDeployStatus("sig"), { status: DeployStatus.INCLUDED_IN_BLOCK });
        assert.deepEqual(calls.observer, ["sig"]);
    });
}

test("a verdict without detail carries no detail field", async () => {
    const api = adapter(NodeApiProfile.RUST, async () => ({ state: "Expired", detail: null }), pendingInBlock);
    assert.deepEqual(await api.getDeployStatus("sig"), { status: DeployStatus.EXPIRED });
});

test("the Scala profile does not ask the validator for a verdict", async () => {
    const calls: IStatusCalls = { validator: [], observer: [] };
    const api = adapter(NodeApiProfile.SCALA, async () => ({ state: "Rejected" }), pendingInBlock, calls);
    await api.getDeployStatus("sig");
    assert.deepEqual(calls.validator, []);
});

const pollerFor = (statuses: IDeployStatusResult[]): DeployStatusPoller => {
    let index = 0;
    const api = {
        getDeployStatus: async () => statuses[Math.min(index++, statuses.length - 1)],
    } as unknown as NodeApiAdapter;
    return new DeployStatusPoller({ api } as unknown as INetworkContextInput);
};

for (const [status, state, code] of [
    [DeployStatus.REJECTED, "Rejected", CustomErrorCode.DEPLOY_VERDICT_REJECTED],
    [DeployStatus.EXPIRED, "Expired", CustomErrorCode.DEPLOY_VERDICT_EXPIRED],
    [DeployStatus.FAILED, "Failed", CustomErrorCode.DEPLOY_VERDICT_FAILED],
] as const) {
    test(`the poller ends a watch at once on the verdict ${state}`, async () => {
        const poller = pollerFor([{ status: DeployStatus.DEPLOYING }, { status, detail: "kind: why" }]);
        const seen: string[] = [];
        const started = Date.now();
        await assert.rejects(
            poller.watch("deploy-id", { onStatus: (result) => seen.push(result.status) }, { intervalMs: 5, timeoutMs: 60_000 }).done,
            (error: unknown) => {
                assert.ok(error instanceof DeployVerdictError);
                assert.equal(error.state, state);
                assert.equal(error.code, code);
                assert.equal(error.deployId, "deploy-id");
                assert.equal(error.detail, "kind: why");
                assert.match(error.message, /kind: why/);
                return true;
            },
        );
        assert.deepEqual(seen, [DeployStatus.DEPLOYING, status]);
        assert.ok(Date.now() - started < 5_000);
    });
}

test("the poller still times out while the deploy stays pending", async () => {
    const poller = pollerFor([{ status: DeployStatus.DEPLOYING }]);
    await assert.rejects(poller.waitFor("deploy-id", { intervalMs: 5, timeoutMs: 30 }), DeployTimeoutError);
});
