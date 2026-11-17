import test from "node:test";
import assert from "node:assert/strict";
import DeployService from "@services/DeployService";
import NodeApiProvider from "@domains/NodeApiProvider";
import { SignedResult } from "@services/Signer";
import { CustomErrorCode, DeployAdmissionRefusedError, DeployQueueRefusedError, DeployRefusedError, DeploySubmissionRejectedError, DeploySubmissionUnknownError } from "@domains/CustomError";

const signed = (): SignedResult => ({ data: { term: "Nil", timestamp: 123 }, signature: "abcdef", deployer: "public-key", sigAlgorithm: "secp256k1" });
const failure = (status: number, data: unknown) => Object.assign(new Error("node response"), { isAxiosError: true, response: { status, data } });
const service = (submitDeploy: (value: SignedResult) => Promise<unknown>) => new DeployService({ getApi: () => ({ submitDeploy }) } as unknown as NodeApiProvider);

for (const code of ["deploy_pool_busy", "deploy_admission_busy"] as const) {
    test(`503 ${code} retries the exact signed envelope three times and returns a typed refusal`, async () => {
        const deploy = signed();
        const payloads: SignedResult[] = [];
        const arrivals: number[] = [];
        const client = service(async (payload) => {
            arrivals.push(performance.now());
            payloads.push(structuredClone(payload));
            deploy.data.timestamp = 999;
            throw failure(503, { error: code, message: "not accepted" });
        });
        await assert.rejects(client.submitSignedDeploy(deploy), (error: unknown) => {
            assert.ok(error instanceof DeployAdmissionRefusedError);
            assert.ok(error instanceof DeploySubmissionRejectedError);
            assert.equal(error.admissionCode, code);
            assert.equal(error.deployId, "abcdef");
            assert.equal(error.status, 503);
            assert.equal(error.retryable, true);
            return true;
        });
        assert.equal(payloads.length, 3);
        assert.ok(arrivals[1] - arrivals[0] >= 200);
        assert.ok(arrivals[2] - arrivals[1] >= 400);
        assert.ok(payloads.every((payload) => payload.data.timestamp === 123 && payload.signature === "abcdef"));
        assert.deepEqual(payloads[0], payloads[2]);
    });
}

for (const [status, code, errorCode, retryable] of [
    [413, "deploy_too_large", CustomErrorCode.DEPLOY_TOO_LARGE, false],
    [400, "deploy_expired", CustomErrorCode.DEPLOY_EXPIRED, false],
    [400, "invalid_deploy_window", CustomErrorCode.DEPLOY_WINDOW_INVALID, true],
] as const) {
    test(`HTTP ${status} ${code} is a typed node refusal and is not retried`, async () => {
        let requests = 0;
        const client = service(async () => { requests += 1; throw failure(status, { error: code, message: "not accepted" }); });
        await assert.rejects(client.submitSignedDeploy(signed()), (error: unknown) => {
            assert.ok(error instanceof DeployRefusedError);
            assert.ok(error instanceof DeploySubmissionRejectedError);
            assert.ok(!(error instanceof DeployAdmissionRefusedError));
            assert.equal(error.rejectionCode, code);
            assert.equal(error.code, errorCode);
            assert.equal(error.status, status);
            assert.equal(error.deployId, "abcdef");
            assert.equal(error.retryable, retryable);
            return true;
        });
        assert.equal(requests, 1);
    });
}

for (const [status, body] of [[400, { error: "deploy_too_large" }], [413, { error: "deploy_expired" }], [400, { error: "illegal_argument" }]] as const) {
    test(`HTTP ${status} ${JSON.stringify(body)} stays a generic rejection`, async () => {
        const client = service(async () => { throw failure(status, body); });
        await assert.rejects(client.submitSignedDeploy(signed()), (error: unknown) => {
            assert.ok(error instanceof DeploySubmissionRejectedError);
            assert.ok(!(error instanceof DeployRefusedError));
            return true;
        });
    });
}

for (const [status, body] of [[503, "proxy unavailable"], [503, {}], [503, { error: "observer_busy" }], [500, { error: "deploy_pool_busy" }]] as const) {
    test(`HTTP ${status} without the exact admission contract is unknown and never retried (${JSON.stringify(body)})`, async () => {
        let requests = 0;
        const client = service(async () => { requests += 1; throw failure(status, body); });
        await assert.rejects(client.submitSignedDeploy(signed()), DeploySubmissionUnknownError);
        assert.equal(requests, 1);
    });
}

test("a timeout after an explicit refusal stops retrying and preserves the unknown signed ID", async () => {
    let requests = 0;
    const client = service(async () => {
        requests += 1;
        if (requests === 1) throw failure(503, { error: "deploy_admission_busy" });
        throw Object.assign(new Error("timeout"), { isAxiosError: true, code: "ECONNABORTED" });
    });
    await assert.rejects(client.submitSignedDeploy(signed()), (error: unknown) => {
        assert.ok(error instanceof DeploySubmissionUnknownError);
        assert.equal(error.deployId, "abcdef");
        assert.ok(!(error instanceof DeploySubmissionRejectedError));
        return true;
    });
    assert.equal(requests, 2);
});

test("eventual acceptance uses the original node and signed ID", async () => {
    let requests = 0;
    let providers = 0;
    const originalApi = { submitDeploy: async () => {
        requests += 1;
        if (requests < 3) throw failure(503, { error: "deploy_pool_busy" });
        return "Success! DeployId is: abcdef";
    } };
    const client = new DeployService({ getApi: () => { providers += 1; return originalApi; } } as unknown as NodeApiProvider);
    assert.equal(await client.submitSignedDeploy(signed()), "abcdef");
    assert.equal(requests, 3);
    assert.equal(providers, 1);
});

test("an acceptance response for another signature remains unknown", async () => {
    let requests = 0;
    const client = service(async () => { requests += 1; return { deployId: "different" }; });
    await assert.rejects(client.submitSignedDeploy(signed()), DeploySubmissionUnknownError);
    assert.equal(requests, 1);
});

test("a permanent 400 refusal is never retried or relabelled transient", async () => {
    let requests = 0;
    const client = service(async () => { requests += 1; throw failure(400, { error: "invalid_deploy_window" }); });
    await assert.rejects(client.submitSignedDeploy(signed()), (error: unknown) => error instanceof DeploySubmissionRejectedError && !(error instanceof DeployAdmissionRefusedError));
    assert.equal(requests, 1);
});

const queueFailure = (status: number, data: unknown, headers: Record<string, string> = {}) =>
    Object.assign(new Error("queue response"), { isAxiosError: true, response: { status, data, headers } });

for (const [message, congestion, retryable] of [
    ["deploy queue is full: the validator is taking fewer deploys than arrive, so the deploys ahead of this one would not land before its validity window closes; sign it again with a current validAfterBlockNumber and retry in 12s", "validator", false],
    ["deploy queue is full: the validator has created no block while the shard moved on, so ...", "validator_idle", false],
    ["deploy queue is full: the shard's finality is holding the validator back, so ...", "shard", false],
    ["deploy queue is full: the signed deploys the queue holds fill its storage budget, so ...", "storage", false],
    ["deploy queue is full for this deployer: it holds 4 of the 4 deploys one deployer may hold, so that other deployers keep room; retry in 12s", "deployer_share", true],
] as const) {
    test(`503 deploy_queue_full (${congestion}) is a typed queue refusal with its wait and is not retried`, async () => {
        let requests = 0;
        const client = service(async () => {
            requests += 1;
            throw queueFailure(503, { error: "deploy_queue_full", message }, { "retry-after": "12" });
        });
        await assert.rejects(client.submitSignedDeploy(signed()), (error: unknown) => {
            assert.ok(error instanceof DeployQueueRefusedError);
            assert.ok(error instanceof DeploySubmissionRejectedError);
            assert.equal(error.queueCode, "deploy_queue_full");
            assert.equal(error.code, CustomErrorCode.DEPLOY_QUEUE_FULL);
            assert.equal(error.status, 503);
            assert.equal(error.deployId, "abcdef");
            assert.equal(error.retryAfterMs, 12_000);
            assert.equal(error.congestion, congestion);
            assert.equal(error.retryable, retryable);
            return true;
        });
        assert.equal(requests, 1);
    });
}

for (const [code, headers, wait] of [
    ["node_unavailable", { "retry-after": "5" }, 5_000],
    ["deploy_queue_stopped", {}, undefined],
] as const) {
    test(`503 ${code} is a retryable queue refusal`, async () => {
        const client = service(async () => { throw queueFailure(503, { error: code, message: "queue" }, headers); });
        await assert.rejects(client.submitSignedDeploy(signed()), (error: unknown) => {
            assert.ok(error instanceof DeployQueueRefusedError);
            assert.equal(error.queueCode, code);
            assert.equal(error.code, CustomErrorCode.DEPLOY_QUEUE_UNAVAILABLE);
            assert.equal(error.retryAfterMs, wait);
            assert.equal(error.congestion, undefined);
            assert.equal(error.retryable, true);
            return true;
        });
    });
}

test("a Retry-After read through axios headers is honoured", async () => {
    const headers = { get: (name: string) => (name === "retry-after" ? "7" : undefined) };
    const client = service(async () => {
        throw Object.assign(new Error("queue"), { isAxiosError: true, response: { status: 503, data: { error: "node_unavailable" }, headers } });
    });
    await assert.rejects(client.submitSignedDeploy(signed()), (error: unknown) =>
        error instanceof DeployQueueRefusedError && error.retryAfterMs === 7_000);
});

for (const [status, body] of [[500, { error: "queue_store_error", message: "store failed" }], [500, { error: "deploy_queue_full" }]] as const) {
    test(`HTTP ${status} ${JSON.stringify(body)} from a queue leaves the outcome unknown`, async () => {
        const client = service(async () => { throw queueFailure(status, body); });
        await assert.rejects(client.submitSignedDeploy(signed()), DeploySubmissionUnknownError);
    });
}

test("409 duplicate_deploy means the node already holds the signed deploy", async () => {
    let requests = 0;
    const client = service(async () => {
        requests += 1;
        throw queueFailure(409, { error: "duplicate_deploy", message: "Deploy already known: abcdef" });
    });
    assert.equal(await client.submitSignedDeploy(signed()), "abcdef");
    assert.equal(requests, 1);
});

test("a 409 without the duplicate code stays a rejection", async () => {
    const client = service(async () => { throw queueFailure(409, { error: "conflict" }); });
    await assert.rejects(client.submitSignedDeploy(signed()), (error: unknown) =>
        error instanceof DeploySubmissionRejectedError && !(error instanceof DeployQueueRefusedError));
});
