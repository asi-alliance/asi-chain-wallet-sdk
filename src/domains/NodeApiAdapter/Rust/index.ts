import NodeApiAdapter from "@domains/NodeApiAdapter";
import { IGetBlocksParams } from "@domains/ObserverClient";
import { MAX_UINT256 } from "@utils/constants";
import { ensureValid, validateBlockNumber } from "@utils/validators";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { DeployData, IDeployInfo } from "@domains/Deploy";
import SignerService from "@services/Signer";

interface ISimpleExploreDeployRequest {
    term: string;
}

interface IRustBlockDto {
    blockInfo: {
        blockNumber: number | string;
    };
}

interface IRustDeployInfo extends IDeployInfo {
    isFinalized?: boolean;
}

const LATEST_BLOCK_PARAMS: IGetBlocksParams = {
    view: "summary",
};

export default class RustNodeApiAdapter extends NodeApiAdapter {
    public getProfile(): NodeApiProfile {
        return NodeApiProfile.RUST;
    }

    public getMaxPhloPrice(): bigint {
        return MAX_UINT256;
    }

    public toDeployPhloPrice(phloPrice: bigint): DeployData["phloPrice"] {
        return phloPrice.toString();
    }

    public serializeDeployData(deployData: DeployData): Uint8Array {
        return SignerService.deployDataUint256ProtobufSerialize(deployData);
    }

    public getTransferGasReserve(maxPhloCharge: bigint): bigint {
        return maxPhloCharge;
    }

    protected buildExploreDeployBody(
        term: string,
    ): ISimpleExploreDeployRequest {
        return { term };
    }

    public isDeployFinalized(deploy: IRustDeployInfo): boolean {
        return deploy.isFinalized === true;
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
