import { IBlockDto, IGetBlocksParams } from "@domains/ObserverClient";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import {
    DeployData,
    DeployStatus,
    IDeployInfo,
    IDeployStatusResult,
} from "@domains/Deploy";
import {
    getErrorMessage,
    INVALID_BLOCK_NUMBER,
    SCALA_FAULT_TOLERANCE_THRESHOLD,
} from "@utils/index";
import { GasFee } from "@config/index";
import { UnknownErrorReason } from "@domains/CustomError";
import SignerService from "@services/Signer";
import type { IApiClients } from "@domains/ApiClientManager";
import type { TransactionHistoryQueryData } from "@services/GraphqlParser";
import type { Pagination } from "@services/GraphqlParser/queryOptions";
import type { SignedResult } from "@services/Signer";

export interface IExploratoryDeployClient {
    submitExploratoryDeploy(body: unknown): Promise<unknown>;
}

const MAX_SAFE_PHLO_PRICE: bigint = BigInt(Number.MAX_SAFE_INTEGER);

export default abstract class NodeApiAdapter {
    protected readonly clients: IApiClients;

    constructor(clients: IApiClients) {
        this.clients = clients;
    }

    public abstract getProfile(): NodeApiProfile;

    public getMaxPhloPrice(): bigint {
        return MAX_SAFE_PHLO_PRICE;
    }

    public toDeployPhloPrice(phloPrice: bigint): DeployData["phloPrice"] {
        return Number(phloPrice);
    }

    public serializeDeployData(deployData: DeployData): Uint8Array {
        return SignerService.deployDataProtobufSerialize(deployData);
    }

    public getTransferGasReserve(_maxPhloCharge: bigint): bigint {
        return GasFee.MAX;
    }

    public submitDeploy(deploy: SignedResult): Promise<unknown> {
        return this.clients.validator.submitDeploy(deploy);
    }

    protected getExploreDeployClient(): IExploratoryDeployClient {
        return this.clients.observer;
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

    public isDeployFinalized(deploy: IDeployInfo): boolean {
        return (deploy.faultTolerance ?? 0) >= SCALA_FAULT_TOLERANCE_THRESHOLD;
    }

    public async getDeployStatus(
        deployHash: string,
    ): Promise<IDeployStatusResult> {
        try {
            const deploy = (await this.getDeploy(deployHash)) as IDeployInfo;

            if (!deploy?.blockHash) {
                return {
                    status: DeployStatus.DEPLOYING,
                };
            }

            return {
                status: this.isDeployFinalized(deploy)
                    ? DeployStatus.FINALIZED
                    : DeployStatus.INCLUDED_IN_BLOCK,
            };
        } catch (error) {
            return {
                status: DeployStatus.CHECK_ERROR,
                errorMessage: getErrorMessage(
                    error,
                    UnknownErrorReason.NODE_API,
                ),
            };
        }
    }

    public getBlock(blockHash: string): Promise<IBlockDto> {
        return this.clients.observer.getBlock(blockHash);
    }

    public getBlocks(params?: IGetBlocksParams): Promise<IBlockDto[]> {
        return this.clients.observer.getBlocks(params);
    }

    public async getLatestBlockNumber(): Promise<number> {
        const [latestBlock]: IBlockDto[] = await this.getBlocks();

        return latestBlock?.blockNumber ?? INVALID_BLOCK_NUMBER;
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
