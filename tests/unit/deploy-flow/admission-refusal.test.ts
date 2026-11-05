import test from "node:test";
import assert from "node:assert/strict";
import DeployService from "@services/DeployService";
import NodeApiProvider from "@domains/NodeApiProvider";
import ValidatorClient from "@domains/ValidatorClient";
import { SignedResult } from "@services/Signer";
import { DeployAdmissionRefusedError, DeploySubmissionRejectedError, DeploySubmissionUnknownError } from "@domains/CustomError";

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

for (const timeout of [undefined, 1200]) {
    test(`deployment HTTP requests have a finite timeout (override=${timeout})`, async () => {
        let actual = 0;
        const client = new ValidatorClient({
            baseUrl: "http://node.invalid",
            axiosConfig: { timeout, adapter: async (config) => {
                actual = config.timeout ?? 0;
                return { data: "accepted", status: 200, statusText: "OK", headers: {}, config };
            } },
        });
        await client.submitDeploy(signed());
        assert.equal(actual, timeout ?? 30_000);
    });
}
