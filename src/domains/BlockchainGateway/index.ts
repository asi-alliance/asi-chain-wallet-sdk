import axios, { AxiosRequestConfig } from "axios";
import AxiosHttpClient, { HttpClient } from "../HttpClient";

type Deploy = any;
type Block = any;

export type DeploySubmitResult = {};

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

    public async submitDeploy(deploy: Deploy): Promise<any> {
        return await this.validatorClient.post("/deploy", deploy, {
            headers: {
                "Content-Type": "text/plain",
            },
        });
    }

    public async getDeploy(deployHash: string): Promise<Deploy> {
        return await this.indexerClient.get(`/api/deploy/${deployHash}`);
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
}
