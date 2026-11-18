import NodeApiAdapter from "@domains/NodeApiAdapter";
import { IGetBlocksParams } from "@domains/ObserverClient";
import { MAX_UINT256 } from "@utils/constants";
import { isDeployVerdictStatus, isRecord } from "@utils/guards";
import { ensureValid, validateBlockNumber } from "@utils/validators";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import {
    DeployData,
    IDeployInfo,
    IDeployStatusResult,
} from "@domains/Deploy";
import SignerService from "@services/Signer";

interface ISimpleExploreDeployRequest {
    term: string;
}

export enum DeployFinalizationState {
    FINALIZED = "Finalized",
    FAILED = "Failed",
    PENDING = "Pending",
    EXPIRED = "Expired",
}

interface IRustDeployInfo extends IDeployInfo {
    finalizationState?: DeployFinalizationState;
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
        return deploy.finalizationState === DeployFinalizationState.FINALIZED;
    }

    /**
     * Reports the validator's terminal verdict first: the observer never sees
     * a deploy that a deploy queue holds or rejected (node-rust #990), nor
     * tells an expired or failed deploy from a pending one. Finalization is
     * still read from the observer.
     */
    public async getDeployStatus(
        deployHash: string,
    ): Promise<IDeployStatusResult> {
        const [verdict, observedStatus]: [
            IDeployStatusResult | undefined,
            IDeployStatusResult,
        ] = await Promise.all([
            this.getDeployVerdict(deployHash),
            super.getDeployStatus(deployHash),
        ]);

        return verdict ?? observedStatus;
    }

    /**
     * The validator's `Rejected`, `Expired` or `Failed` verdict, or
     * `undefined` while the deploy is pending, finalized, or the validator
     * cannot answer (such as a node without the endpoint).
     */
    private async getDeployVerdict(
        deployHash: string,
    ): Promise<IDeployStatusResult | undefined> {
        let answer: unknown;

        try {
            answer =
                await this.clients.validator.getDeployFinalizationStatus(
                    deployHash,
                );
        } catch {
            return undefined;
        }

        if (!isRecord(answer) || !isDeployVerdictStatus(answer.state)) {
            return undefined;
        }

        return typeof answer.detail === "string" && answer.detail
            ? { status: answer.state, detail: answer.detail }
            : { status: answer.state };
    }

    public async getLatestBlockNumber(): Promise<number> {
        // TODO(next-major): read a Rust block DTO checked by its guard once
        // ObserverClient.getBlocks types the response for both profiles.
        const [latestBlock]: unknown[] =
            await this.clients.observer.getBlocks(LATEST_BLOCK_PARAMS);

        const blockNumber: unknown =
            isRecord(latestBlock) && isRecord(latestBlock.blockInfo)
                ? latestBlock.blockInfo.blockNumber
                : undefined;

        ensureValid(validateBlockNumber(blockNumber), {
            context: "RustNodeApiAdapter.getLatestBlockNumber",
        });

        return Number(blockNumber);
    }
}
