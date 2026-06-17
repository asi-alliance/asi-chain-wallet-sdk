import axios, { AxiosRequestConfig } from "axios";
import AxiosHttpClient, { HttpClient } from "@domains/HttpClient";
import {
    FAULT_TOLERANCE_THRESHOLD,
    INVALID_BLOCK_NUMBER,
} from "@utils/constants";
import { SignedResult } from "@domains/Signer";
import { Network } from "@domains/aggregates/Network";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { Transaction } from "@domains/aggregates/Transaction";
import {
    GraphqlParser,
    TransactionHistoryQueryData,
} from "@services/GraphqlParser";

export enum DeployStatus {
    DEPLOYING = "Deploying",
    INCLUDED_IN_BLOCK = "IncludedInBlock",
    FINALIZED = "Finalized",

    CHECK_ERROR = "CheckingError",
}

export type DeployStatusResult =
    | { status: Exclude<DeployStatus, DeployStatus.CHECK_ERROR> }
    | { status: DeployStatus.CHECK_ERROR; errorMessage: string };

type GatewayClientConfig = {
    baseUrl: string;
    axiosConfig?: AxiosRequestConfig;
};

export interface BlockchainGatewayConfig {
    validator: GatewayClientConfig;
    observer: GatewayClientConfig;
    indexer: GatewayClientConfig;
}

export default class BlockchainGateway {
    private static instance: BlockchainGateway;
    private static config: any;

    private validatorClient: HttpClient;
    private observerClient: HttpClient;
    private indexerClient: HttpClient;

    private network!: Network;

    private constructor(
        validatorClient: HttpClient,
        observerClient: HttpClient,
        indexerClient: HttpClient,
        currentNetwork?: Network,
    ) {
        this.validatorClient = validatorClient;
        this.observerClient = observerClient;
        this.indexerClient = indexerClient;

        if (!currentNetwork) {
            return;
        }

        this.setNetwork(currentNetwork);
    }

    private static createHttpClient(config: GatewayClientConfig): HttpClient {
        const axiosInstance = axios.create({
            baseURL: config.baseUrl,
            ...config.axiosConfig,
        });

        return new AxiosHttpClient(axiosInstance);
    }

    public setNetwork(network: Network) {
        if (!network.endpoints.validatorUrl) {
            throw new Error(
                `BlockchainGateway: validatorUrl for ${network.name} network is not provided! Check .env file`,
            );
        }
        if (!network.endpoints.readOnlyUrl) {
            throw new Error(
                `BlockchainGateway: readOnlyUrl for ${network.name} network is not provided! Check .env file`,
            );
        }
        if (!network.endpoints.indexerUrl) {
            throw new Error(
                `BlockchainGateway: indexerUrl for ${network.name} network is not provided! Check .env file`,
            );
        }
        this.validatorClient = BlockchainGateway.createHttpClient(
            BlockchainGateway.config.validator,
        );
        this.observerClient = BlockchainGateway.createHttpClient(
            BlockchainGateway.config.observer,
        );
        this.indexerClient = BlockchainGateway.createHttpClient(
            BlockchainGateway.config.indexer,
        );

        this.network = network;
    }

    public changeValidator(config: GatewayClientConfig): this {
        this.validatorClient = BlockchainGateway.createHttpClient(config);
        return this;
    }

    public changeObserver(config: GatewayClientConfig): this {
        this.observerClient = BlockchainGateway.createHttpClient(config);
        return this;
    }

    public changeIndexer(config: GatewayClientConfig): this {
        this.indexerClient = BlockchainGateway.createHttpClient(config);
        return this;
    }

    public static init(config: BlockchainGatewayConfig): BlockchainGateway {
        BlockchainGateway.instance = new BlockchainGateway(
            this.createHttpClient(config.validator),
            this.createHttpClient(config.observer),
            this.createHttpClient(config.indexer),
        );

        this.config = config;

        return BlockchainGateway.instance;
    }

    public static isInitialized(): boolean {
        return BlockchainGateway?.instance !== undefined;
    }

    public static getInstance(): BlockchainGateway {
        if (!BlockchainGateway.isInitialized()) {
            throw new Error(
                "BlockchainGateway is not initialized. Call BlockchainGateway.init() first.",
            );
        }

        return BlockchainGateway.instance;
    }

    public getValidatorClientUrl(): string {
        return this.validatorClient.getBaseUrl() ?? "";
    }

    public async submitDeploy(
        deployData: SignedResult,
    ): Promise<string | undefined> {
        try {
            const result = await this.validatorClient.post(
                "/api/deploy",
                deployData,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );

            console.log(
                "BlockchainGateway.submitDeploy: Deploy result:",
                result,
            );

            // Parse deploy ID from response
            if (typeof result === "string") {
                const deployIdMatch = /DeployId is:\s*([a-fA-F0-9]+)/.exec(
                    result,
                );

                if (deployIdMatch) {
                    return deployIdMatch[1];
                }
                return result;
            }

            return result.signature || result.deployId || result;
        } catch (error) {
            const message =
                "BlockchainGateway.submitDeploy: " +
                this.getGatewayErrorMessage(error);
            throw new Error(message);
        }
    }

    public async submitExploratoryDeploy(rholangCode: string): Promise<any> {
        try {
            return await this.observerClient.post(
                `/api/explore-deploy`,
                rholangCode,
            );
        } catch (error) {
            const message =
                "BlockchainGateway.submitExploratoryDeploy: " +
                this.getGatewayErrorMessage(error);
            throw new Error(message);
        }
    }

    public async exploreDeployData(rholangCode: string): Promise<any> {
        try {
            const result = await this.submitExploratoryDeploy(rholangCode);
            return result.expr;
        } catch (error: any) {
            const message =
                "BlockchainGateway.exploreDeployData: " +
                this.getGatewayErrorMessage(error);
            console.error(message);
            throw new Error(message);
        }
    }

    public async getDeploy(deployHash: string): Promise<any> {
        return await this.observerClient.get(`/api/deploy/${deployHash}`);
    }

    public async isDeployFinalized(deploy: any): Promise<boolean> {
        return deploy.faultTolerance >= FAULT_TOLERANCE_THRESHOLD;
    }

    public async getDeployStatus(
        deployHash: string,
    ): Promise<DeployStatusResult> {
        try {
            let deploy: any;

            deploy = await this.getDeploy(deployHash);
            if (!deploy?.blockHash) {
                return { status: DeployStatus.DEPLOYING };
            }

            const isFinalized = await this.isDeployFinalized(deploy);
            return {
                status: isFinalized
                    ? DeployStatus.FINALIZED
                    : DeployStatus.INCLUDED_IN_BLOCK,
            };
        } catch (error) {
            const message =
                "BlockchainGateway.getDeployStatus: " +
                this.getGatewayErrorMessage(error);
            return {
                status: DeployStatus.CHECK_ERROR,
                errorMessage: message,
            };
        }
    }

    public getIndexerClient(): HttpClient {
        return this.indexerClient;
    }

    public async getBlock(blockHash: string): Promise<any> {
        const response = await this.observerClient.get(
            `/api/block/${blockHash}`,
        );

        return response?.blockInfo;
    }

    public async getLatestBlockNumber(): Promise<number> {
        try {
            const block = await this.getLatestBlock();
            return block?.blockNumber ?? INVALID_BLOCK_NUMBER;
        } catch (error) {
            const message =
                "BlockchainGateway.getLatestBlockNumber: " +
                this.getGatewayErrorMessage(error);
            console.error(message);
            return INVALID_BLOCK_NUMBER;
        }
    }

    public async isValidatorActive(): Promise<boolean> {
        try {
            await this.validatorClient.get(`/status`);
            return true;
        } catch (error) {
            console.error(
                "BlockchainGateway.isValidatorActive: Node health check failed:",
                error,
            );
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
            const errorMessage =
                "BlockchainGateway.validateBlocksResponse: No blocks returned from /api/blocks endpoint";
            throw new Error(errorMessage);
        }
    }

    private async getLatestBlock(): Promise<any> {
        const blocks = await this.observerClient.get(`/api/blocks/1`);
        this.validateBlocksResponse(blocks);

        return blocks[0];
    }

    public async fetchTransactionHistory(
        address: string,
        pagination: Pagination = {},
    ): Promise<Transaction[]> {
        try {
            const response = await BlockchainGateway.getInstance()
                .getIndexerClient()
                .post(
                    "",
                    GraphqlParser.createTransactionHistoryRequest(
                        address,
                        pagination,
                    ),
                );
            const envelope =
                GraphqlParser.unwrapGraphqlEnvelope<TransactionHistoryQueryData>(
                    response,
                );

            if (envelope.errors?.length) {
                console.error("[GraphQL] GraphQL errors:", envelope.errors);
                throw envelope.errors;
            }

            return GraphqlParser.mapTransactionHistory(
                envelope.data,
                address,
                this.network.name,
            );
        } catch (error: any) {
            if (GraphqlParser.isRecoverableNetworkError(error)) {
                console.warn(
                    "[GraphQL] Network error while loading transaction history. Returning an empty history.",
                );
                return [];
            }

            console.error(
                "Error fetching transaction history from indexer:",
                error,
            );
            return [];
        }
    }
}
