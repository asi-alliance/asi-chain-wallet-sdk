import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import { FAULT_TOLERANCE_THRESHOLD } from "@utils/index";
import { SignedResult } from "@services/Signer";

export enum DeployStatus {
    DEPLOYING = "Deploying",
    INCLUDED_IN_BLOCK = "IncludedInBlock",
    FINALIZED = "Finalized",
    CHECK_ERROR = "CheckingError",
}

export type IDeployStatusResult =
    | {
          status:
              | DeployStatus.DEPLOYING
              | DeployStatus.INCLUDED_IN_BLOCK
              | DeployStatus.FINALIZED;
      }
    | {
          status: DeployStatus.CHECK_ERROR;
          errorMessage: string;
      };

export default class DeployService {
    private readonly nodeApiProvider: NodeApiProvider;

    constructor(nodeApiProvider?: NodeApiProvider) {
        this.nodeApiProvider =
            nodeApiProvider ?? NodeApiProvider.getInstance();
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

    public async submitSignedDeploy(
        deploy: SignedResult,
    ): Promise<string | undefined> {
        try {
            const result = await this.api.submitDeploy(deploy);

            return this.extractDeployId(result);
        } catch (error) {
            throw new Error(
                `DeployService.submitDeploy: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    public async exploreDeployData(rholangCode: string): Promise<any> {
        try {
            const result = (await this.api.exploreDeploy(rholangCode)) as {
                expr?: unknown;
            };

            return result.expr;
        } catch (error) {
            throw new Error(
                "DeployService.exploreDeployData: " +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
    }

    public async getDeploy(deployHash: string): Promise<any> {
        return this.api.getDeploy(deployHash);
    }

    public async isDeployFinalized(deploy: any): Promise<boolean> {
        return deploy.faultTolerance >= FAULT_TOLERANCE_THRESHOLD;
    }

    public async getDeployStatus(
        deployHash: string,
    ): Promise<IDeployStatusResult> {
        try {
            const deploy = await this.getDeploy(deployHash);

            if (!deploy?.blockHash) {
                return {
                    status: DeployStatus.DEPLOYING,
                };
            }

            const finalized = await this.isDeployFinalized(deploy);

            return {
                status: finalized
                    ? DeployStatus.FINALIZED
                    : DeployStatus.INCLUDED_IN_BLOCK,
            };
        } catch (error) {
            return {
                status: DeployStatus.CHECK_ERROR,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            };
        }
    }
}
