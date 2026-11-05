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
    DeploySubmissionUnknownError,
    UnknownErrorReason,
} from "@domains/CustomError";
import { getErrorMessage, isRejectedByServer } from "@utils/index";

const ADMISSION_RETRY_DELAYS_MS = [250, 500] as const;

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
