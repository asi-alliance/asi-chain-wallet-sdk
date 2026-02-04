import axios, { AxiosRequestConfig } from "axios";
import AxiosHttpClient, { HttpClient } from "@domains/HttpClient";
import { FAULT_TOLERANCE_THRESHOLD } from "@utils/constants";
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
    | { status: DeployStatus.DEPLOYING | DeployStatus.FINALIZING | DeployStatus.FINALIZED }
    | { status: DeployStatus.DEPLOY_ERROR; error: Error };

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
        let deploy: Deploy;
        
        try {
            deploy = await this.getDeploy(deployHash);
        } catch (error) {
            const message = axios.isAxiosError(error) 
                ? `Failed to get deploy: ${error.response?.status ?? error.code} ${error.response?.statusText ?? error.message}`
                : error instanceof Error ? error.message : String(error);
            return { 
                status: DeployStatus.DEPLOY_ERROR, 
                error: new Error(message)
            };
        }

        if (!deploy?.blockHash) {
            return { status: DeployStatus.DEPLOYING };
        }

        const isFinalized = await this.isDeployFinalized(deploy);
        return { 
            status: isFinalized ? DeployStatus.FINALIZED : DeployStatus.FINALIZING 
        };
    }

    public async getBlock(blockHash: string): Promise<Block> {
        const response = await this.indexerClient.get(
            `/api/block/${blockHash}`,
        );

        return response.blockInfo;
    }

    public async getLatestBlock(): Promise<Block> {
        const blocksArray = await this.indexerClient.get(`/api/blocks/1`);
        return blocksArray[0].blockNumber;
    }
   
    public async isNodeActive(): Promise<boolean> {
        try {
            await this.validatorClient.get(`/status`);
            return true;
        } catch (error) {
            console.error('Node health check failed:', error);
            return false;
        }
    }

    // should not be here
    public async buildDeploy(data: any): Promise<any> { // return DeployData
        // STACY TODO: Implement logic to build deploy data
        return {};
    }

    // should not be here
    public async signDeploy(deployData: DeployData): Promise<any> { // return SignedDeployData
        // STACY/Andrew TODO: Implement logic to build deploy data
        return {};
    }
}
