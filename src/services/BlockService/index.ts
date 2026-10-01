import { IBlockDto } from "@domains/ObserverClient";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import { INVALID_BLOCK_NUMBER } from "@utils/index";

export default class BlockService {
    private readonly nodeApiProvider: NodeApiProvider;

    constructor(nodeApiProvider?: NodeApiProvider) {
        this.nodeApiProvider =
            nodeApiProvider ?? NodeApiProvider.getInstance();
    }

    private get api(): NodeApiAdapter {
        return this.nodeApiProvider.getApi();
    }

    public async getBlock(blockHash: string): Promise<string> {
        const response: IBlockDto = await this.api.getBlock(blockHash);

        return response.blockInfo;
    }

    public async getLatestBlock(): Promise<IBlockDto> {
        const blocks: IBlockDto[] = await this.api.getBlocks();

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
            await this.api.getValidatorStatus();

            return true;
        } catch {
            return false;
        }
    }
}
