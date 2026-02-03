import axios, { AxiosRequestConfig } from "axios";
import AxiosHttpClient, { HttpClient } from "../HttpClient";
import { DeployData } from "../../services/Chain";

type Deploy = any;
type Block = any;

// just placeholders
export type SignedDeployData = any;


export type DeployStatus = "Deploying" | "Finalizing" | "Finalized" | "DeployError" | "FinalizationError";
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

    public async submitDeploy(deployData: DeployData): Promise<DeploySubmitResult> {
        return await this.validatorClient.post("/deploy", deployData, {
            headers: {
                "Content-Type": "text/plain",
            },
        });
    }

    public async getDeploy(deployHash: string): Promise<Deploy> {
        return await this.indexerClient.get(`/api/deploy/${deployHash}`);
    }

    public async getDeployStatus(deployHash: string): Promise<DeployStatus> {
        const deploy: Deploy = await this.getDeploy(deployHash);
        // STACY TODO: Logic to determine status from deploy object
        return deploy.status;
    }

    public async getBlock(blockHash: string): Promise<Block> {
        const response = await this.indexerClient.get(
            `/api/block/${blockHash}`,
        );

        return response.blockInfo;
    }

    public async getLatestBlock(): Promise<Block> {
        const blocksArray = await this.indexerClient.get(`/api/blocks/1`);

        return blocksArray[0];
    }

    public async getNodeStatus(): Promise<any> {
        const response = await this.validatorClient.get(`/status`);

        return response;
    }

    public async isDeployFinalized(deployHash: string): Promise<boolean> {
        const deploy: Deploy = await this.getDeploy(deployHash);
        if (deploy.faultTolerance >= 0.99) 
            return true;     
        return false;
    }

    public async buildDeploy(data: any): Promise<DeployData> {
        // STACY TODO: Implement logic to build deploy data
        return {};
    }

    public async signDeploy(deployData: DeployData): Promise<SignedDeployData> {
        // STACY/Andrew TODO: Implement logic to build deploy data
        return {};
    }
}
