import BaseHttpClient from "@domains/BaseHttpClient";

export interface IBalanceResponse {
    balance: number;
}

export interface IBlockDto {
    blockInfo: string;
    blockNumber?: number;
}

export default class ObserverClient extends BaseHttpClient {
    public getBalance(address: string): Promise<IBalanceResponse> {
        return this.get(`/api/balance/${address}`);
    }

    public getDeploy(deployHash: string) {
        return this.get(`/api/deploy/${deployHash}`);
    }

    public getBlock(blockHash: string): Promise<IBlockDto> {
        return this.get(`/api/block/${blockHash}`);
    }

    public getLatestBlock(): Promise<IBlockDto> {
        return this.get("/api/block/latest");
    }
}
