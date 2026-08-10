import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import { IDeployInfo, IDeployStatusResult } from "@domains/Deploy";
import { SignedResult } from "@services/Signer";

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

    public async isDeployFinalized(deploy: IDeployInfo): Promise<boolean> {
        return this.api.isDeployFinalized(deploy);
    }

    public getDeployStatus(deployHash: string): Promise<IDeployStatusResult> {
        return this.api.getDeployStatus(deployHash);
    }
}
