import ObserverClient, { IBlockDto } from "@domains/ObserverClient";
import ValidatorClient from "@domains/ValidatorClient";

import {
    FAULT_TOLERANCE_THRESHOLD,
    INVALID_BLOCK_NUMBER,
} from "@utils/constants";

export enum DeployStatus {
    DEPLOYING = "Deploying",
    INCLUDED_IN_BLOCK = "IncludedInBlock",
    FINALIZED = "Finalized",
    CHECK_ERROR = "CheckingError",
}

export type DeployStatusResult =
    | {
          status:
              | DeployStatus.DEPLOYING
              | DeployStatus.INCLUDED_IN_BLOCK
              | DeployStatus.FINALIZED;
      }
    | {
          status: DeployStatus.CHECK_ERROR;
          errorMessage: string;
      };

export default class BlockService {
    constructor(
        private readonly observerClient: ObserverClient,
        private readonly validatorClient: ValidatorClient,
    ) {}

    public async getDeploy(deployHash: string): Promise<any> {
        return this.observerClient.getDeploy(deployHash);
    }

    public async getBlock(blockHash: string): Promise<any> {
        const response: IBlockDto =
            await this.observerClient.getBlock(blockHash);

        return response.blockInfo;
    }

    public async getLatestBlock(): Promise<any> {
        return this.observerClient.getLatestBlock();
    }

    public async getLatestBlockNumber(): Promise<number> {
        try {
            const block: IBlockDto = await this.getLatestBlock();

            return block.blockNumber ?? INVALID_BLOCK_NUMBER;
        } catch {
            return INVALID_BLOCK_NUMBER;
        }
    }

    public async isDeployFinalized(deploy: any): Promise<boolean> {
        return deploy.faultTolerance >= FAULT_TOLERANCE_THRESHOLD;
    }

    public async getDeployStatus(
        deployHash: string,
    ): Promise<DeployStatusResult> {
        try {
            const deploy = await this.getDeploy(deployHash);

            if (!deploy?.blockHash) {
                return {
                    status: DeployStatus.DEPLOYING,
                };
            }

            const finalized = await this.isDeployFinalized(deploy);

            return {
                status: finalized
                    ? DeployStatus.FINALIZED
                    : DeployStatus.INCLUDED_IN_BLOCK,
            };
        } catch (error) {
            return {
                status: DeployStatus.CHECK_ERROR,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            };
        }
    }

    public async isValidatorActive(): Promise<boolean> {
        try {
            await this.validatorClient.getStatus();

            return true;
        } catch {
            return false;
        }
    }
}
