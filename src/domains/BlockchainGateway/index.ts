import axios, { AxiosRequestConfig } from "axios";
import AxiosHttpClient, { HttpClient } from "@domains/HttpClient";
import { FAULT_TOLERANCE_THRESHOLD, INVALID_BLOCK_NUMBER} from "@utils/constants";
import { DeployData } from "@services/Chain";

export enum DeployStatus {
    DEPLOYING = "Deploying",
    INCLUDED_IN_BLOCK = "IncludedInBlock",
    FINALIZED = "Finalized",

    CHECK_ERROR = "CheckingError",
}

export type DeployStatusResult = 
    | { status: Exclude<DeployStatus, DeployStatus.CHECK_ERROR>}
    | { status: DeployStatus.CHECK_ERROR; errorMessage: string };

//TODO specify types
export type DeploySubmitResult = any;
type Deploy = any;
type Block = any;

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

    private validatorClient: HttpClient;
    private indexerClient: HttpClient;

    private constructor() {}

    public static initValidator(config: BlockchainGatewayConfig["validator"]): BlockchainGateway {
        if (!this.isInitialized()) {
            BlockchainGateway.instance = new BlockchainGateway();
        }

        const validatorAxios = axios.create({
            baseURL: config.baseUrl,
            ...config.axiosConfig,
        });

        BlockchainGateway.instance.validatorClient = new AxiosHttpClient(validatorAxios);

        return BlockchainGateway.instance;
    }
    
    public static initIndexer(config: BlockchainGatewayConfig["indexer"]): BlockchainGateway {
        if (!this.isInitialized()) {
            BlockchainGateway.instance = new BlockchainGateway();
        }

        const indexerAxios = axios.create({
            baseURL: config.baseUrl,
            ...config.axiosConfig,
        });

        BlockchainGateway.instance.indexerClient = new AxiosHttpClient(indexerAxios);

        return BlockchainGateway.instance;
    }

    public static init(config: BlockchainGatewayConfig): BlockchainGateway {
        BlockchainGateway.instance = new BlockchainGateway();
        BlockchainGateway.initValidator(config.validator);
        BlockchainGateway.initIndexer(config.indexer);
        return BlockchainGateway.instance;
    }

    public static isInitialized(): boolean {
        const instance = BlockchainGateway.instance;
        return (
            instance !== null && 
            instance.validatorClient !== null && 
            instance.indexerClient !== null
        );
    }

    public static getInstance(): BlockchainGateway {
        if (!BlockchainGateway.isInitialized()) {
            throw new Error(
                "BlockchainGateway is not initialized. Call BlockchainGateway.init() first.",
            );
        }

        return BlockchainGateway.instance;
    }

    // TODO handling with parseDeploymentError
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
                status: isFinalized ? DeployStatus.FINALIZED : DeployStatus.INCLUDED_IN_BLOCK 
            };
        } catch (error) {
            const message = "BlockchainGateway.getDeployStatus: " + this.getGatewayErrorMessage(error);
            return { 
                status: DeployStatus.CHECK_ERROR, 
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
            const message = "BlockchainGateway.getLatestBlockNumber: " + this.getGatewayErrorMessage(error);
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

    private getGatewayErrorMessage(error: any): string {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status ?? error.code;
            const statusText = error.response?.statusText ?? ""; 
            const url = error.config?.url ?? "";
            return `Axios error while requesting "${url}": [${status}] ${statusText} - ${error.message}`;
        }

        if (error instanceof Error) {
            return error.message;
        }
        
        return String(error);
    }

    private validateBlocksResponse(blocks: any[]): void {
        if (!blocks?.length) {
            const errorMessage = 'BlockchainGateway.validateBlocksResponse: No blocks returned from /api/blocks endpoint';
            throw new Error(errorMessage);
        }
    }

    private async getLatestBlock(): Promise<Block> {
        const blocks = await this.indexerClient.get(`/api/blocks/1`);
        this.validateBlocksResponse(blocks);

        return blocks[0];
    }
}
