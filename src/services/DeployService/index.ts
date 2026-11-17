import axios from "axios";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import { IDeployInfo, IDeployStatusResult } from "@domains/Deploy";
import { SignedResult } from "@services/Signer";
import {
    ApiRequestError,
    ApiSource,
    DeploySubmissionRejectedError,
    DeployAdmissionCode,
    DeployAdmissionRefusedError,
    DeployRefusedError,
    DeployRejectionCode,
    DeployQueueCongestion,
    DeployQueueRefusalCode,
    DeployQueueRefusedError,
    DeploySubmissionUnknownError,
    UnknownErrorReason,
} from "@domains/CustomError";
import { getErrorMessage, isRejectedByServer } from "@utils/index";

const DEPLOY_REJECTIONS: ReadonlyArray<readonly [number, DeployRejectionCode]> = [
    [413, "deploy_too_large"],
    [400, "deploy_expired"],
    [400, "invalid_deploy_window"],
];

const deployRejection = (error: unknown): { code: DeployRejectionCode; status: number } | undefined => {
    if (!axios.isAxiosError(error) || !error.response) {
        return undefined;
    }
    const kind: unknown = error.response.data?.error;
    const match = DEPLOY_REJECTIONS.find(([status, code]) => status === error.response?.status && code === kind);
    return match ? { status: match[0], code: match[1] } : undefined;
};

const ADMISSION_RETRY_DELAYS_MS = [250, 500] as const;

const QUEUE_CONGESTION_PREFIXES: ReadonlyArray<readonly [string, DeployQueueCongestion]> = [
    ["deploy queue is full for this deployer", "deployer_share"],
    ["deploy queue is full: the validator has created no block", "validator_idle"],
    ["deploy queue is full: the validator is taking fewer deploys", "validator"],
    ["deploy queue is full: the shard's finality", "shard"],
    ["deploy queue is full: the signed deploys the queue holds", "storage"],
];

const QUEUE_REFUSAL_CODES: ReadonlySet<string> = new Set<DeployQueueRefusalCode>([
    "deploy_queue_full",
    "node_unavailable",
    "deploy_queue_stopped",
]);

const retryAfterMs = (headers: unknown): number | undefined => {
    const get = (headers as { get?: (name: string) => unknown } | undefined)?.get;
    const value: unknown = typeof get === "function"
        ? get.call(headers, "retry-after")
        : (headers as Record<string, unknown> | undefined)?.["retry-after"];
    if (typeof value !== "string" && typeof value !== "number") {
        return undefined;
    }
    const text = String(value).trim();
    if (/^\d+$/.test(text)) {
        return Number(text) * 1000;
    }
    const date = Date.parse(text);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

/** A deploy queue's HTTP 503 refusal (node-rust #990); the queue did not hold the deploy. */
const queueRefusal = (
    error: unknown,
): { code: DeployQueueRefusalCode; retryAfterMs?: number; congestion?: DeployQueueCongestion } | undefined => {
    if (!axios.isAxiosError(error) || error.response?.status !== 503) {
        return undefined;
    }
    const kind: unknown = error.response.data?.error;
    if (typeof kind !== "string" || !QUEUE_REFUSAL_CODES.has(kind)) {
        return undefined;
    }
    const code = kind as DeployQueueRefusalCode;
    const message: unknown = error.response.data?.message;
    const congestion = code === "deploy_queue_full" && typeof message === "string"
        ? QUEUE_CONGESTION_PREFIXES.find(([prefix]) => message.startsWith(prefix))?.[1]
        : undefined;
    return { code, retryAfterMs: retryAfterMs(error.response.headers), congestion };
};

const isDuplicateDeploy = (error: unknown): boolean =>
    axios.isAxiosError(error) && error.response?.status === 409 && error.response.data?.error === "duplicate_deploy";

export default class DeployService {
    private readonly nodeApiProvider: NodeApiProvider;

    constructor(nodeApiProvider?: NodeApiProvider) {
        this.nodeApiProvider = nodeApiProvider ?? NodeApiProvider.getInstance();
    }

    private get api(): NodeApiAdapter {
        return this.nodeApiProvider.getApi();
    }

    private extractDeployId(result: unknown): string | undefined {
        if (typeof result === "string") {
            const match = /DeployId is:\s*([a-fA-F0-9]+)/.exec(result);

            return match?.[1] ?? result;
        }

        if (result && typeof result === "object") {
            const response = result as {
                deployId?: string;
                signature?: string;
            };

            return response.deployId ?? response.signature;
        }

        return undefined;
    }

    public async submitSignedDeploy(deploy: SignedResult): Promise<string | undefined> {
        const api = this.api;
        const signedDeploy: SignedResult = JSON.parse(JSON.stringify(deploy));
        for (let attempt = 0; ; attempt += 1) {
            try {
                const result = await api.submitDeploy(signedDeploy);
                const deployId = this.extractDeployId(result);
                if (!deployId || deployId.toLowerCase() !== signedDeploy.signature.toLowerCase()) {
                    throw new DeploySubmissionUnknownError(
                        "DeployService.submitSignedDeploy", "Unexpected acceptance response", signedDeploy.signature,
                    );
                }
                return deployId;
            } catch (error) {
                if (error instanceof DeploySubmissionUnknownError) { throw error; }
                const reason = getErrorMessage(error, UnknownErrorReason.NODE_API);
                const code: unknown = axios.isAxiosError(error) && error.response?.status === 503
                    ? error.response.data?.error : undefined;
                if (code === "deploy_pool_busy" || code === "deploy_admission_busy") {
                    const admissionCode: DeployAdmissionCode = code;
                    const delay = ADMISSION_RETRY_DELAYS_MS[attempt];
                    if (delay !== undefined) {
                        await new Promise<void>((resolve) => setTimeout(resolve, delay));
                        continue;
                    }
                    throw new DeployAdmissionRefusedError(
                        "DeployService.submitSignedDeploy", reason, admissionCode, signedDeploy.signature,
                    );
                }
                const queue = queueRefusal(error);
                if (queue) {
                    throw new DeployQueueRefusedError(
                        "DeployService.submitSignedDeploy", reason, queue.code, signedDeploy.signature,
                        queue.retryAfterMs, queue.congestion,
                    );
                }
                // The node or its deploy queue already holds this signed deploy,
                // for example after a resend of an unknown outcome: watch it
                // rather than release its reservation.
                if (isDuplicateDeploy(error)) {
                    return signedDeploy.signature;
                }
                const rejection = deployRejection(error);
                if (rejection) {
                    throw new DeployRefusedError(
                        "DeployService.submitSignedDeploy", reason, rejection.code, signedDeploy.signature, rejection.status,
                    );
                }
                if (isRejectedByServer(error)) {
                    throw new DeploySubmissionRejectedError("DeployService.submitSignedDeploy", reason);
                }
                throw new DeploySubmissionUnknownError("DeployService.submitSignedDeploy", reason, signedDeploy.signature);
            }
        }
    }

    public async exploreDeployData(rholangCode: string): Promise<any> {
        try {
            const result = (await this.api.exploreDeploy(rholangCode)) as {
                expr?: unknown;
            };

            return result.expr;
        } catch (error) {
            throw new ApiRequestError(
                ApiSource.NODE,
                "DeployService.exploreDeployData",
                getErrorMessage(error, UnknownErrorReason.NODE_API),
            );
        }
    }

    public async getDeploy(deployHash: string): Promise<any> {
        return this.api.getDeploy(deployHash);
    }

    public async isDeployFinalized(deploy: IDeployInfo): Promise<boolean> {
        return this.api.isDeployFinalized(deploy);
    }

    public getDeployStatus(deployHash: string): Promise<IDeployStatusResult> {
        return this.api.getDeployStatus(deployHash);
    }
}
