import NodeApiAdapter from "@domains/NodeApiAdapter";
import { IGetBlocksParams } from "@domains/ObserverClient";
import { RUST_FAULT_TOLERANCE_THRESHOLD } from "@utils/constants";
import { ensureValid, validateBlockNumber } from "@utils/validators";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { IDeployInfo } from "@domains/Deploy";

interface ISimpleExploreDeployRequest {
    term: string;
}

interface IRustBlockDto {
    blockInfo: {
        blockNumber: number | string;
    };
}

const LATEST_BLOCK_PARAMS: IGetBlocksParams = {
    view: "summary",
};

export default class RustNodeApiAdapter extends NodeApiAdapter {
    public getProfile(): NodeApiProfile {
        return NodeApiProfile.RUST;
    }

    protected buildExploreDeployBody(
        term: string,
    ): ISimpleExploreDeployRequest {
        return { term };
    }

    public isDeployFinalized(deploy: IDeployInfo): boolean {
        return (deploy.faultTolerance ?? 0) >= RUST_FAULT_TOLERANCE_THRESHOLD;
    }

    public async getLatestBlockNumber(): Promise<number> {
        const [latestBlock]: IRustBlockDto[] =
            await this.clients.observer.getBlocks<IRustBlockDto>(
                LATEST_BLOCK_PARAMS,
            );

        const blockNumber: unknown = latestBlock?.blockInfo.blockNumber;

        ensureValid(validateBlockNumber(blockNumber), {
            context: "RustNodeApiAdapter.getLatestBlockNumber",
        });

        return Number(blockNumber);
    }
}
