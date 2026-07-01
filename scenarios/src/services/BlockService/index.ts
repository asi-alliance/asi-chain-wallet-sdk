import ObserverClient, { IBlockDto } from "../../domains/ObserverClient";
import ApiClientManager from "../../domains/ApiClientManager";
import { INVALID_BLOCK_NUMBER } from "../../utils";

export enum DeployStatus {
    DEPLOYING = "Deploying",
    INCLUDED_IN_BLOCK = "IncludedInBlock",
    FINALIZED = "Finalized",
    CHECK_ERROR = "CheckingError",
}

export type IDeployStatusResult =
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
    private readonly apiClientManager: ApiClientManager;

    constructor(apiClientManager?: ApiClientManager) {
        this.apiClientManager =
            apiClientManager ?? ApiClientManager.getInstance();
    }

    public async getBlock(blockHash: string): Promise<string> {
        const observerClient: ObserverClient =
            this.apiClientManager.getObserverClient();

        const response: IBlockDto = await observerClient.getBlock(blockHash);

        return response.blockInfo;
    }

    public async getLatestBlock(): Promise<IBlockDto> {
        const blocks: IBlockDto[] = await this.apiClientManager
            .getObserverClient()
            .getBlocks();

        if (!blocks?.length) {
            throw new Error(
                "BlockService.getLatestBlock: No blocks returned from /api/blocks",
            );
        }

        return blocks[0];
    }

    public async getLatestBlockNumber(): Promise<number> {
        try {
            const block: IBlockDto = await this.getLatestBlock();

            return block.blockNumber ?? INVALID_BLOCK_NUMBER;
        } catch {
            return INVALID_BLOCK_NUMBER;
        }
    }

    public async isValidatorActive(): Promise<boolean> {
        try {
            await this.apiClientManager.getValidatorClient().getStatus();

            return true;
        } catch {
            return false;
        }
    }
}
