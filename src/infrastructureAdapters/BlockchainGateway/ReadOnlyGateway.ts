import { Network, NetworkName } from "@domains/Network";
import { IHttpClient } from "../../application/ports/outbound/IHttpClient";
import { getGatewayErrorMessage } from "./common";
import { FAULT_TOLERANCE_THRESHOLD } from "@utils/constants";
import { INVALID_BLOCK_NUMBER} from "@utils/constants";

export enum DeployStatus {
    DEPLOYING = "Deploying",
    INCLUDED_IN_BLOCK = "IncludedInBlock",
    FINALIZED = "Finalized",

    CHECK_ERROR = "CheckingError",
}

export type DeployStatusResult =
    | { status: Exclude<DeployStatus, DeployStatus.CHECK_ERROR> }
    | { status: DeployStatus.CHECK_ERROR; errorMessage: string };

export class ReadOnlyGateway {
    private httpClient: IHttpClient;
    private network: Network;

    constructor(httpClient: IHttpClient, network: Network) {
        this.httpClient = httpClient;
        this.network = network;
    }
    public async submitExploratoryDeploy(rholangCode: string): Promise<any> {
        try {
            // Different networks use different request formats
            if (this.network.name === "Dev" satisfies NetworkName) {
                // Dev network expects {term: rholangCode}
                return await this.httpClient.post(`/api/explore-deploy`, { term: rholangCode });
            } else {
                // DevNet network expects rholangCode directly
                return await this.httpClient.post(`/api/explore-deploy`, rholangCode);
            }
        } catch (error) {
            const message = "BlockchainGateway.submitExploratoryDeploy: " + getGatewayErrorMessage(error);
            throw new Error(message);
        }
    }

    public async exploreDeployData(rholangCode: string): Promise<any> {
        try {
            const result = await this.submitExploratoryDeploy(rholangCode);
            return result.expr;
        } catch (error: any) {
            const message = "BlockchainGateway.exploreDeployData: " + getGatewayErrorMessage(error);
            console.error(message);
            throw new Error(message);
        }
    }

    public async getDeploy(deployHash: string): Promise<any> {
        return await this.httpClient.get(`/api/deploy/${deployHash}`);
    }
    public async isDeployFinalized(deploy: any): Promise<boolean> {
        return deploy.faultTolerance >= FAULT_TOLERANCE_THRESHOLD;
    }
    public async getDeployStatus(deployHash: string): Promise<DeployStatusResult> {
        try {
            let deploy: any;

            deploy = await this.getDeploy(deployHash);
            if (!deploy?.blockHash) {
                return { status: DeployStatus.DEPLOYING };
            }

            const isFinalized = await this.isDeployFinalized(deploy);
            return {
                status: isFinalized ? DeployStatus.FINALIZED : DeployStatus.INCLUDED_IN_BLOCK
            };
        } catch (error) {
            const message = "BlockchainGateway.getDeployStatus: " + getGatewayErrorMessage(error);
            return {
                status: DeployStatus.CHECK_ERROR,
                errorMessage: message,
            };
        }
    }
    private validateBlocksResponse(blocks: any[]): void {
        if (!blocks?.length) {
            const errorMessage = 'BlockchainGateway.validateBlocksResponse: No blocks returned from /api/blocks endpoint';
            throw new Error(errorMessage);
        }
    }
    public async getBlock(blockHash: string): Promise<any> {
        const response = await this.httpClient.get(
            `/api/block/${blockHash}`,
        );

        return response?.blockInfo;
    }
    private async getLatestBlock(): Promise<any> {
        const blocks = await this.httpClient.get(`/api/blocks/1`);
        this.validateBlocksResponse(blocks);

        return blocks[0];
    }
    public async getLatestBlockNumber(): Promise<number> {
        try {
            const block = await this.getLatestBlock();
            return block?.blockNumber ?? INVALID_BLOCK_NUMBER;
        } catch (error) {
            const message = "BlockchainGateway.getLatestBlockNumber: " + getGatewayErrorMessage(error);
            console.error(message);
            return INVALID_BLOCK_NUMBER;
        }
    }
}


