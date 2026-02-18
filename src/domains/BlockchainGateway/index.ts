import axios, { AxiosRequestConfig } from "axios";
import AxiosHttpClient, { HttpClient } from "@domains/HttpClient";
import { FAULT_TOLERANCE_THRESHOLD, INVALID_BLOCK_NUMBER} from "@utils/constants";
import { DeployData } from "@services/Chain";

type Deploy = any;
type Block = any;

// just placeholders
export type SignedDeployData = any;

export enum DeployStatus {
    DEPLOYING = "Deploying",
    FINALIZING = "Finalizing",
    FINALIZED = "Finalized",
    DEPLOY_ERROR = "DeployError",
   // FINALIZATION_ERROR = "FinalizationError",
}

export type DeployStatusResult = 
    | { status: Exclude<DeployStatus, DeployStatus.DEPLOY_ERROR>}
    | { status: DeployStatus.DEPLOY_ERROR; errorMessage: string };

export type DeploySubmitResult = any;

export interface BlockchainGatewayConfig {
    validator: {
        baseUrl: string;
        axiosConfig?: AxiosRequestConfig;
    };
    indexer: {
        baseUrl: string;
        axiosConfig?: AxiosRequestConfig;
    };
}

export default class BlockchainGateway {
    private static instance: BlockchainGateway | null = null;

    private constructor(
        private readonly validatorClient: HttpClient,
        private readonly indexerClient: HttpClient,
    ) {}

    public static init(config: BlockchainGatewayConfig): BlockchainGateway {
        const validatorAxios = axios.create({
            baseURL: config.validator.baseUrl,
            ...config.validator.axiosConfig,
        });

        const indexerAxios = axios.create({
            baseURL: config.indexer.baseUrl,
            ...config.indexer.axiosConfig,
        });

        BlockchainGateway.instance = new BlockchainGateway(
            new AxiosHttpClient(validatorAxios),
            new AxiosHttpClient(indexerAxios),
        );

        return BlockchainGateway.instance;
    }

    public static isInitialized(): boolean {
        return BlockchainGateway.instance !== null;
    }

    public static getInstance(): BlockchainGateway {
        if (!BlockchainGateway.instance) {
            throw new Error(
                "BlockchainGateway is not initialized. Call BlockchainGateway.init() first.",
            );
        }

        return BlockchainGateway.instance;
    }

    public async submitDeploy(
        deployData: DeployData,
    ): Promise<DeploySubmitResult> {
        return await this.validatorClient.post("/deploy", deployData, {
            headers: {
                "Content-Type": "text/plain",
            },
        });
    }

    // For read-only operations
    public async submitExploratoryDeploy(rholangCode: string): Promise<DeploySubmitResult> {
        return await this.indexerClient.post(`/api/explore-deploy`, rholangCode);
    }
    
    public async getDeploy(deployHash: string): Promise<Deploy> {
        return await this.indexerClient.get(`/api/deploy/${deployHash}`);
    }

    public async isDeployFinalized(deploy: Deploy): Promise<boolean> {
        return deploy.faultTolerance >= FAULT_TOLERANCE_THRESHOLD;
    }

    public async getDeployStatus(deployHash: string): Promise<DeployStatusResult> {
        try {
            let deploy: Deploy;

            deploy = await this.getDeploy(deployHash);
            if (!deploy?.blockHash) {
                return { status: DeployStatus.DEPLOYING };
            }

            const isFinalized = await this.isDeployFinalized(deploy);
            return { 
                status: isFinalized ? DeployStatus.FINALIZED : DeployStatus.FINALIZING 
            };
        } catch (error) {
            const message = this.getDeployErrorMessage(error);
            console.error(message);
            return { 
                status: DeployStatus.DEPLOY_ERROR, 
                errorMessage: message,
            };
        }
    }

    public async getBlock(blockHash: string): Promise<Block> {
        const response = await this.indexerClient.get(
            `/api/block/${blockHash}`,
        );

        return response?.blockInfo;
    }

    public async getLatestBlockNumber(): Promise<number> {
        try {
            const block = await this.getLatestBlock();
            return block?.blockNumber ?? INVALID_BLOCK_NUMBER;
        } catch (error) {
            const message = this.getDeployErrorMessage(error);
            console.error(message);
            return INVALID_BLOCK_NUMBER;
        }
    }
   
    public async isNodeActive(): Promise<boolean> {
        try {
            await this.validatorClient.get(`/status`);
            return true;
        } catch (error) {
            console.error('BlockchainGateway.isNodeActive: Node health check failed:', error);
            return false;
        }
    }

    private getDeployErrorMessage(error: any): string {
        if (axios.isAxiosError(error)) {
            return `BlockchainGateway.getDeployErrorMessage: Failed to get deploy: ${error.response?.status ?? error.code} ${error.response?.statusText ?? error.message}`;
        }

        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    private validateBlocksResponse(blocks: any[]): void {
        if (!blocks?.length) {
            const errorMessage = 'BlockchainGateway.validateBlocksResponse: No blocks returned from /api/blocks endpoint';
            console.error(errorMessage, { blocks });
            throw new Error(errorMessage);
        }
    }

    private async getLatestBlock(): Promise<Block> {
        const blocks = await this.indexerClient.get(`/api/blocks/1`);
        this.validateBlocksResponse(blocks);

        return blocks[0];
    }
}
