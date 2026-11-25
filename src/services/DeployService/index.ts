import { AxiosResponse } from "axios";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import {
    DEPLOY_REJECTION_STATUSES,
    DUPLICATE_DEPLOY_CODE,
    IDeployInfo,
    IDeployStatusResult,
} from "@domains/Deploy";
import { SignedResult } from "@services/Signer";
import {
    ApiRequestError,
    ApiSource,
    DeploySubmissionRejectedError,
    DeployAdmissionRefusedError,
    DeployRefusedError,
    DeployQueueRefusedError,
    DeploySubmissionUnknownError,
    UnknownErrorReason,
} from "@domains/CustomError";
import {
    HTTP_CONFLICT_STATUS,
    HTTP_SERVICE_UNAVAILABLE_STATUS,
    getErrorMessage,
    getErrorResponse,
    getResponseDataField,
    isDeployAdmissionCode,
    isDeployQueueCause,
    isDeployQueueRefusalCode,
    isDeployRejectionCode,
    isRejectedByServer,
    parseRetryAfterMs,
} from "@utils/index";

const SUBMIT_OPERATION: string = "DeployService.submitSignedDeploy";

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
                deployId?: unknown;
                signature?: unknown;
            };
            const deployId: unknown = response.deployId ?? response.signature;

            return typeof deployId === "string" ? deployId : undefined;
        }

        return undefined;
    }

    private static isDuplicateDeploy(error: unknown): boolean {
        const response: AxiosResponse | undefined = getErrorResponse(error);

        return (
            response?.status === HTTP_CONFLICT_STATUS &&
            getResponseDataField(response, "error") === DUPLICATE_DEPLOY_CODE
        );
    }

    private static toSubmissionError(error: unknown, deployId: string): Error {
        const reason: string = getErrorMessage(
            error,
            UnknownErrorReason.NODE_API,
        );
        const response: AxiosResponse | undefined = getErrorResponse(error);
        const kind: unknown = getResponseDataField(response, "error");
        const message: unknown = getResponseDataField(response, "message");
        const refusalReason: string =
            typeof message === "string" && message.trim() ? message : reason;
        const isServiceUnavailable: boolean =
            response?.status === HTTP_SERVICE_UNAVAILABLE_STATUS;

        if (isServiceUnavailable && isDeployAdmissionCode(kind)) {
            return new DeployAdmissionRefusedError(
                SUBMIT_OPERATION,
                refusalReason,
                kind,
                deployId,
            );
        }

        if (isServiceUnavailable && isDeployQueueRefusalCode(kind)) {
            const queueCause: unknown = getResponseDataField(response, "cause");

            return new DeployQueueRefusedError(
                SUBMIT_OPERATION,
                refusalReason,
                kind,
                deployId,
                parseRetryAfterMs(response?.headers["retry-after"]),
                isDeployQueueCause(queueCause) ? queueCause : undefined,
            );
        }

        if (
            isDeployRejectionCode(kind) &&
            response?.status === DEPLOY_REJECTION_STATUSES[kind]
        ) {
            return new DeployRefusedError(
                SUBMIT_OPERATION,
                refusalReason,
                kind,
                deployId,
                response.status,
            );
        }

        if (isRejectedByServer(error)) {
            return new DeploySubmissionRejectedError(SUBMIT_OPERATION, reason);
        }

        return new DeploySubmissionUnknownError(
            SUBMIT_OPERATION,
            reason,
            deployId,
        );
    }

    public async submitSignedDeploy(
        signedDeploy: SignedResult,
    ): Promise<string> {
        let result: unknown;

        try {
            result = await this.api.submitDeploy(signedDeploy);
        } catch (error: unknown) {
            if (DeployService.isDuplicateDeploy(error)) {
                return signedDeploy.signature;
            }

            throw DeployService.toSubmissionError(
                error,
                signedDeploy.signature,
            );
        }

        const deployId: string | undefined = this.extractDeployId(result);

        if (
            !deployId ||
            deployId.toLowerCase() !== signedDeploy.signature.toLowerCase()
        ) {
            throw new DeploySubmissionUnknownError(
                SUBMIT_OPERATION,
                "Unexpected acceptance response",
                signedDeploy.signature,
            );
        }

        return deployId;
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
