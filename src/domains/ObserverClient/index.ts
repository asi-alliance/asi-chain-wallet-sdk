import BaseHttpClient from "@domains/BaseHttpClient";
import { buildUrl } from "@utils/index";

export interface IBalanceResponse {
    balance: number;
}

export interface IBlockDto {
    blockInfo: string;
    blockNumber: number;
}

export type TBlocksView = "summary" | "full";

export interface IGetBlocksParams {
    start?: number;
    end?: number;
    view?: TBlocksView;
}

export default class ObserverClient extends BaseHttpClient {
    public getDeploy(deployHash: string) {
        return this.get(`/api/deploy/${deployHash}`);
    }

    public getBlock(blockHash: string): Promise<IBlockDto> {
        return this.get(`/api/block/${blockHash}`);
    }

    public getBlocks(params: IGetBlocksParams = {}): Promise<IBlockDto[]> {
        const { start, end, view } = params;

        const path: string = buildUrl("api/blocks", {
            path: {
                start,
                end,
                view,
            },
        });

        return this.get(path, view ? { params: { view } } : undefined);
    }

    public submitExploratoryDeploy(body: unknown): Promise<any> {
        return this.post("/api/explore-deploy", body);
    }
}
