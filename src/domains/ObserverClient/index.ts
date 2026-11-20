import BaseHttpClient from "@domains/BaseHttpClient";
import { buildUrl } from "@utils/index";

export interface IBalanceResponse {
    balance: number | string;
}

export interface IBlockDto {
    blockInfo: string;
    blockNumber: number;
}

export type TBlocksView = "summary" | "full";

export interface IGetBlocksParams {
    start?: number;
    end?: number;
    depth?: number;
    view?: TBlocksView;
}

const BLOCKS_PATH: string = "api/blocks";

export default class ObserverClient extends BaseHttpClient {
    public getDeploy(deployHash: string) {
        return this.get(`/api/deploy/${deployHash}`);
    }

    public getBlock(blockHash: string): Promise<IBlockDto> {
        return this.get(`/api/block/${blockHash}`);
    }

    // TODO(next-major): type the response for both node API profiles; the
    // Rust node returns the block number in blockInfo.blockNumber.
    public getBlocks(params: IGetBlocksParams = {}): Promise<IBlockDto[]> {
        const { start, end, depth, view } = params;

        const path: string = buildUrl(BLOCKS_PATH, {
            path: {
                start,
                end,
                view,
            },
            pathSegments: [depth],
        });

        return this.get(path, view ? { params: { view } } : undefined);
    }

    public submitExploratoryDeploy(body: unknown): Promise<any> {
        return this.post("/api/explore-deploy", body);
    }
}
