import test from "node:test";
import assert from "node:assert/strict";
import { AxiosHeaders } from "axios";

import NodeApiProvider from "@domains/NodeApiProvider";
import {
    DeployAdmissionCode,
    DeployQueueRefusalCode,
    DeployRejectionCode,
} from "@domains/Deploy";
import {
    ApiRequestError,
    ApiSource,
    CustomErrorCode,
    DeployAdmissionRefusedError,
    DeployQueueRefusedError,
    DeployRefusalError,
    DeployRefusedError,
    DeploySubmissionRejectedError,
    DeploySubmissionUnknownError,
} from "@domains/CustomError";
import DeployService from "@services/DeployService";
import { SignedResult } from "@services/Signer";

const SIGNATURE = "abcdef";
const SUBMIT_OPERATION = "DeployService.submitSignedDeploy";
const NODE_FAILURE_REASON = "node response";
const QUEUE_RETRY_AFTER = "12";
const QUEUE_RETRY_AFTER_MS = 12_000;
const AXIOS_RETRY_AFTER = "7";
const AXIOS_RETRY_AFTER_MS = 7_000;

const VALIDATOR_QUEUE_FULL_MESSAGE =
    "deploy queue is full: the validator is taking fewer deploys than arrive, so the deploys ahead of this one would not land before its validity window closes; sign it again with a current validAfterBlockNumber and retry in 12s";
const DEPLOYER_SHARE_QUEUE_FULL_MESSAGE =
    "deploy queue is full for this deployer: it holds 4 of the 4 deploys one deployer may hold, so that other deployers keep room; retry in 12s";

type TResponseHeaders = Record<string, string> | AxiosHeaders;

interface IRejectionCase {
    status: number;
    code: DeployRejectionCode;
    errorCode: CustomErrorCode;
    retryable: boolean;
}

interface IFailureCase {
    status: number;
    body: unknown;
}

interface IQueueFullCase {
    cause?: string;
    message: string;
    expectedCause?: string;
}

interface IQueueUnavailableCase {
    code: DeployQueueRefusalCode;
    headers: TResponseHeaders;
    retryAfterMs: number | undefined;
}

const ADMISSION_CODES: DeployAdmissionCode[] = [
    "deploy_pool_busy",
    "deploy_admission_busy",
];

const REJECTION_CASES: IRejectionCase[] = [
    {
        status: 503,
        code: "validator_not_bonded",
        errorCode: CustomErrorCode.VALIDATOR_NOT_BONDED,
        retryable: false,
    },
    {
        status: 413,
        code: "deploy_too_large",
        errorCode: CustomErrorCode.DEPLOY_TOO_LARGE,
        retryable: false,
    },
    {
        status: 400,
        code: "deploy_expired",
        errorCode: CustomErrorCode.DEPLOY_EXPIRED,
        retryable: false,
    },
    {
        status: 400,
        code: "invalid_deploy_window",
        errorCode: CustomErrorCode.DEPLOY_WINDOW_INVALID,
        retryable: true,
    },
];

const GENERIC_REJECTION_CASES: IFailureCase[] = [
    { status: 400, body: { error: "deploy_too_large" } },
    { status: 413, body: { error: "deploy_expired" } },
    { status: 400, body: { error: "illegal_argument" } },
];

const UNKNOWN_OUTCOME_CASES: IFailureCase[] = [
    { status: 500, body: { error: "validator_not_bonded", message: "upstream failure" } },
    { status: 503, body: "proxy unavailable" },
    { status: 503, body: {} },
    { status: 503, body: { error: "observer_busy" } },
    { status: 500, body: { error: "deploy_pool_busy" } },
    { status: 500, body: { error: "queue_store_error", message: "store failed" } },
    { status: 500, body: { error: "deploy_queue_full" } },
];

const MALFORMED_ACCEPTANCE_BODIES: unknown[] = [
    { deployId: 123 },
    { signature: { value: "aa" } },
];

const QUEUE_FULL_CASES: IQueueFullCase[] = [
    ...["validator", "validator_idle", "shard", "storage", "deployer_share"].map((cause) => ({
        cause, expectedCause: cause, message: VALIDATOR_QUEUE_FULL_MESSAGE,
    })),
    { cause: "future", message: DEPLOYER_SHARE_QUEUE_FULL_MESSAGE },
    { message: DEPLOYER_SHARE_QUEUE_FULL_MESSAGE },
];

const QUEUE_UNAVAILABLE_CASES: IQueueUnavailableCase[] = [
    {
        code: "node_unavailable",
        headers: { "retry-after": "5" },
        retryAfterMs: 5_000,
    },
    {
        code: "deploy_queue_stopped",
        headers: {},
        retryAfterMs: undefined,
    },
];

const createSignedDeploy = (): SignedResult => ({
    data: { term: "Nil", timestamp: 123 },
    signature: SIGNATURE,
    deployer: "public-key",
    sigAlgorithm: "secp256k1",
});

const createNodeFailure = (
    status: number,
    data: unknown,
    headers: TResponseHeaders = {},
): Error =>
    Object.assign(new Error(NODE_FAILURE_REASON), {
        isAxiosError: true,
        response: { status, data, headers },
    });

const failWith =
    (status: number, data: unknown, headers?: TResponseHeaders) =>
    async (): Promise<never> => {
        throw createNodeFailure(status, data, headers);
    };

const createDeployService = (
    answer: () => Promise<unknown>,
    submitted: SignedResult[],
): DeployService =>
    new DeployService({
        getApi: () => ({
            submitDeploy: async (deploy: SignedResult) => {
                submitted.push(deploy);

                return answer();
            },
        }),
    } as unknown as NodeApiProvider);

const captureSubmissionError = async (
    answer: () => Promise<unknown>,
    submitted: SignedResult[] = [],
): Promise<unknown> => {
    try {
        await createDeployService(answer, submitted).submitSignedDeploy(
            createSignedDeploy(),
        );
    } catch (error: unknown) {
        return error;
    }

    return null;
};

for (const code of ADMISSION_CODES) {
    test(`503 ${code} is a retryable admission refusal sent once`, async () => {
        console.log(`\n=== 503 ${code} ADMISSION REFUSAL ===`);

        const submitted: SignedResult[] = [];

        const error: unknown = await captureSubmissionError(
            failWith(503, { error: code, message: "not accepted" }),
            submitted,
        );

        console.log("    Error:", (error as Error).constructor.name);
        console.log("    Requests:", submitted.length);

        assert.ok(error instanceof DeployAdmissionRefusedError);
        assert.ok(error instanceof DeployRefusalError);
        assert.ok(error instanceof DeploySubmissionRejectedError);
        assert.equal(error.admissionCode, code);
        assert.equal(error.reason, "not accepted");
        assert.equal(error.code, CustomErrorCode.DEPLOY_ADMISSION_REFUSED);
        assert.equal(error.deployId, SIGNATURE);
        assert.equal(error.status, 503);
        assert.equal(error.retryable, true);
        assert.equal(submitted.length, 1);
    });
}

for (const { status, code, errorCode, retryable } of REJECTION_CASES) {
    test(`HTTP ${status} ${code} is a typed node refusal sent once`, async () => {
        console.log(`\n=== HTTP ${status} ${code} REFUSAL ===`);

        const submitted: SignedResult[] = [];

        const error: unknown = await captureSubmissionError(
            failWith(status, { error: code, message: "not accepted" }),
            submitted,
        );

        console.log("    Error:", (error as Error).constructor.name);
        console.log("    Requests:", submitted.length);

        assert.ok(error instanceof DeployRefusedError);
        assert.ok(error instanceof DeployRefusalError);
        assert.ok(error instanceof DeploySubmissionRejectedError);
        assert.equal(error.rejectionCode, code);
        assert.equal(error.reason, "not accepted");
        assert.equal(error.code, errorCode);
        assert.equal(error.status, status);
        assert.equal(error.deployId, SIGNATURE);
        assert.equal(error.retryable, retryable);
        assert.equal(submitted.length, 1);
    });
}

for (const { status, body } of GENERIC_REJECTION_CASES) {
    test(`HTTP ${status} ${JSON.stringify(body)} stays a generic rejection`, async () => {
        console.log(`\n=== HTTP ${status} GENERIC REJECTION ===`);

        const error: unknown = await captureSubmissionError(
            failWith(status, body),
        );

        console.log("    Error:", (error as Error).constructor.name);

        assert.ok(error instanceof DeploySubmissionRejectedError);
        assert.ok(!(error instanceof DeployRefusalError));
        assert.equal(error.code, CustomErrorCode.DEPLOY_SUBMISSION_REJECTED);
    });
}

for (const { status, body } of UNKNOWN_OUTCOME_CASES) {
    test(`HTTP ${status} ${JSON.stringify(body)} leaves the outcome unknown`, async () => {
        console.log(`\n=== HTTP ${status} UNKNOWN OUTCOME ===`);

        const submitted: SignedResult[] = [];

        const error: unknown = await captureSubmissionError(
            failWith(status, body),
            submitted,
        );

        console.log("    Error:", (error as Error).constructor.name);
        console.log("    Requests:", submitted.length);

        assert.ok(error instanceof DeploySubmissionUnknownError);
        assert.ok(error instanceof ApiRequestError);
        assert.equal(error.code, CustomErrorCode.API_REQUEST_FAILED);
        assert.equal(error.reason, NODE_FAILURE_REASON);
        assert.equal(
            error.message,
            new ApiRequestError(
                ApiSource.NODE,
                SUBMIT_OPERATION,
                NODE_FAILURE_REASON,
            ).message,
        );
        assert.equal(error.deployId, SIGNATURE);
        assert.equal(submitted.length, 1);
    });
}

test("an acceptance response for another signature leaves the outcome unknown", async () => {
    console.log("\n=== ACCEPTANCE FOR ANOTHER SIGNATURE ===");

    const submitted: SignedResult[] = [];

    const error: unknown = await captureSubmissionError(
        async () => ({ deployId: "different" }),
        submitted,
    );

    console.log("    Error:", (error as Error).constructor.name);

    assert.ok(error instanceof DeploySubmissionUnknownError);
    assert.equal(error.deployId, SIGNATURE);
    assert.equal(submitted.length, 1);
});

for (const body of MALFORMED_ACCEPTANCE_BODIES) {
    test(`an acceptance response ${JSON.stringify(body)} leaves the outcome unknown`, async () => {
        console.log(`\n=== MALFORMED ACCEPTANCE ${JSON.stringify(body)} ===`);

        const submitted: SignedResult[] = [];

        const error: unknown = await captureSubmissionError(
            async () => body,
            submitted,
        );

        console.log("    Error:", (error as Error).constructor.name);

        assert.ok(error instanceof DeploySubmissionUnknownError);
        assert.equal(error.deployId, SIGNATURE);
        assert.equal(submitted.length, 1);
    });
}

test("a typed refusal falls back to the transport reason for an unusable node message", async () => {
    for (const message of [undefined, "   ", 123]) {
        const error = await captureSubmissionError(
            failWith(503, { error: "validator_not_bonded", message }),
            [],
        );

        assert.ok(error instanceof DeployRefusedError);
        assert.equal(error.reason, NODE_FAILURE_REASON);
    }
});

for (const { cause, expectedCause, message } of QUEUE_FULL_CASES) {
    test(`503 deploy_queue_full (${cause}) classifies the structured cause independently of the message`, async () => {
        console.log(`\n=== 503 DEPLOY QUEUE FULL (${cause}) ===`);

        const submitted: SignedResult[] = [];

        const error: unknown = await captureSubmissionError(
            failWith(
                503,
                { error: "deploy_queue_full", message, cause },
                { "retry-after": QUEUE_RETRY_AFTER },
            ),
            submitted,
        );

        console.log("    Error:", (error as Error).constructor.name);

        assert.ok(error instanceof DeployQueueRefusedError);
        assert.ok(error instanceof DeployRefusalError);
        assert.ok(error instanceof DeploySubmissionRejectedError);
        assert.equal(error.queueCode, "deploy_queue_full");
        assert.equal(error.code, CustomErrorCode.DEPLOY_QUEUE_FULL);
        assert.equal(error.status, 503);
        assert.equal(error.deployId, SIGNATURE);
        assert.equal(error.retryAfterMs, QUEUE_RETRY_AFTER_MS);
        assert.equal(error.reason, message);
        assert.equal(error.queueCause, expectedCause);
        assert.equal(error.retryable, cause === "deployer_share");
        assert.equal(submitted.length, 1);
    });
}

for (const { code, headers, retryAfterMs } of QUEUE_UNAVAILABLE_CASES) {
    test(`503 ${code} is a retryable queue refusal`, async () => {
        console.log(`\n=== 503 ${code} QUEUE REFUSAL ===`);

        const error: unknown = await captureSubmissionError(
            failWith(503, { error: code, message: "queue" }, headers),
        );

        console.log("    Error:", (error as Error).constructor.name);

        assert.ok(error instanceof DeployQueueRefusedError);
        assert.ok(error instanceof DeployRefusalError);
        assert.equal(error.queueCode, code);
        assert.equal(error.code, CustomErrorCode.DEPLOY_QUEUE_UNAVAILABLE);
        assert.equal(error.retryAfterMs, retryAfterMs);
        assert.equal(error.retryable, true);
    });
}

test("a Retry-After read through axios headers is honoured", async () => {
    console.log("\n=== RETRY-AFTER THROUGH AXIOS HEADERS ===");

    const error: unknown = await captureSubmissionError(
        failWith(
            503,
            { error: "node_unavailable" },
            new AxiosHeaders({ "retry-after": AXIOS_RETRY_AFTER }),
        ),
    );

    console.log("    Retry after:", (error as DeployQueueRefusedError).retryAfterMs);

    assert.ok(error instanceof DeployQueueRefusedError);
    assert.equal(error.retryAfterMs, AXIOS_RETRY_AFTER_MS);
});

test("409 duplicate_deploy means the node already holds the signed deploy", async () => {
    console.log("\n=== 409 DUPLICATE DEPLOY IS ACCEPTED ===");

    const submitted: SignedResult[] = [];

    const deployId: string = await createDeployService(
        failWith(409, {
            error: "duplicate_deploy",
            message: `Deploy already known: ${SIGNATURE}`,
        }),
        submitted,
    ).submitSignedDeploy(createSignedDeploy());

    console.log("    Deploy id:", deployId);

    assert.equal(deployId, SIGNATURE);
    assert.equal(submitted.length, 1);
});

test("a 409 without the duplicate code stays a generic rejection", async () => {
    console.log("\n=== 409 WITHOUT DUPLICATE CODE ===");

    const error: unknown = await captureSubmissionError(
        failWith(409, { error: "conflict" }),
    );

    console.log("    Error:", (error as Error).constructor.name);

    assert.ok(error instanceof DeploySubmissionRejectedError);
    assert.ok(!(error instanceof DeployQueueRefusedError));
    assert.equal(error.code, CustomErrorCode.DEPLOY_SUBMISSION_REJECTED);
});
