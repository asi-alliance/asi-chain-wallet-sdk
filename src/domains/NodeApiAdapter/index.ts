import ApiClientManager, { IApiClients } from "@domains/ApiClientManager";
import { IBlockDto, IGetBlocksParams } from "@domains/ObserverClient";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import type { TransactionHistoryQueryData } from "@services/GraphqlParser";
import type { Pagination } from "@services/GraphqlParser/queryOptions";
import type { SignedResult } from "@services/Signer";

export interface IExploratoryDeployClient {
    submitExploratoryDeploy(body: unknown): Promise<unknown>;
}

export default abstract class NodeApiAdapter {
    protected readonly apiClientManager: ApiClientManager;

    constructor(apiClientManager: ApiClientManager) {
        this.apiClientManager = apiClientManager;
    }

    protected get clients(): IApiClients {
        return this.apiClientManager.getClients();
    }

    public abstract getProfile(): NodeApiProfile;

    public submitDeploy(deploy: SignedResult): Promise<unknown> {
        return this.clients.validator.submitDeploy(deploy);
    }

    protected getExploreDeployClient(): IExploratoryDeployClient {
        return this.clients.validator;
    }

    protected buildExploreDeployBody(term: string): unknown {
        return term;
    }

    public exploreDeploy(term: string): Promise<unknown> {
        return this.getExploreDeployClient().submitExploratoryDeploy(
            this.buildExploreDeployBody(term),
        );
    }

    public getDeploy(deployHash: string): Promise<unknown> {
        return this.clients.observer.getDeploy(deployHash);
    }

    public getBlock(blockHash: string): Promise<IBlockDto> {
        return this.clients.observer.getBlock(blockHash);
    }

    public getBlocks(params?: IGetBlocksParams): Promise<IBlockDto[]> {
        return this.clients.observer.getBlocks(params);
    }

    public getValidatorStatus(): Promise<unknown> {
        return this.clients.validator.getStatus();
    }

    public getTransactionHistory(
        address: string,
        publicKey: string,
        pagination: Pagination = {},
    ): Promise<TransactionHistoryQueryData> {
        return this.clients.indexer.getTransactionHistory(
            address,
            publicKey,
            pagination,
        );
    }
}
