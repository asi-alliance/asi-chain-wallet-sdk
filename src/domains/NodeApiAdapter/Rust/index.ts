import NodeApiAdapter from "@domains/NodeApiAdapter";
import { IGetBlocksParams } from "@domains/ObserverClient";
import { MAX_UINT256 } from "@utils/constants";
import {
    isDeployTerminalStatus,
    isDeployVerdictStatus,
    isRecord,
} from "@utils/guards";
import { ensureValid, validateBlockNumber } from "@utils/validators";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import {
    DeployData,
    DeployStatus,
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

    protected getIncludedDeployStatus(
        deploy: IRustDeployInfo,
    ): IDeployStatusResult {
        switch (deploy.finalizationState) {
            case DeployFinalizationState.FINALIZED:
                return { status: DeployStatus.FINALIZED };
            case DeployFinalizationState.FAILED:
                return { status: DeployStatus.FAILED };
            case DeployFinalizationState.EXPIRED:
                return { status: DeployStatus.EXPIRED };
            default:
                return { status: DeployStatus.INCLUDED_IN_BLOCK };
        }
    }

    public isDeployFinalized(deploy: IRustDeployInfo): boolean {
        return (
            this.getIncludedDeployStatus(deploy).status ===
            DeployStatus.FINALIZED
        );
    }

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

    public getDeployStatus(deployHash: string): Promise<IDeployStatusResult> {
        const verdict: Promise<IDeployStatusResult | undefined> =
            this.getDeployVerdict(deployHash);
        const observedStatus: Promise<IDeployStatusResult> =
            super.getDeployStatus(deployHash);

        return new Promise<IDeployStatusResult>((resolve) => {
            void observedStatus.then((status: IDeployStatusResult) => {
                if (isDeployTerminalStatus(status.status)) {
                    resolve(status);
                }
            });

            void verdict.then((status: IDeployStatusResult | undefined) => {
                if (status) {
                    resolve(status);
                }
            });

            void Promise.all([verdict, observedStatus]).then(
                ([verdictStatus, observed]: [
                    IDeployStatusResult | undefined,
                    IDeployStatusResult,
                ]) => resolve(verdictStatus ?? observed),
            );
        });
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
