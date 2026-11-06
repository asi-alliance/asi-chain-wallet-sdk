import assert from "node:assert/strict";
import test from "node:test";
import BlockService from "@services/BlockService";
import { IBlockDto } from "@domains/ObserverClient";
import { INVALID_BLOCK_NUMBER } from "@utils/index";

class FixtureBlocks extends BlockService {
    constructor(private readonly fixture: unknown) { super(); }
    public async getLatestBlock(): Promise<IBlockDto> { return this.fixture as IBlockDto; }
}

test("latest height accepts the live Rust blockInfo envelope and legacy flat blocks", async () => {
    for (const [fixture, expected] of [
        [{ blockInfo: { blockNumber: 42 } }, 42],
        [{ blockInfo: { blockNumber: "42" } }, 42],
        [{ blockNumber: 42 }, 42],
        [{ blockNumber: "42" }, 42],
        [{ blockInfo: { blockNumber: 0 } }, 0],
    ] as const) {
        assert.equal(await new FixtureBlocks(fixture).getLatestBlockNumber(), expected);
    }
});

test("invalid and unsafe heights never reach the classic signing encoder", async () => {
    for (const value of [undefined, null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1,
        "9007199254740992", "-1", "1.5", "1e3", "01", "", true]) {
        assert.equal(await new FixtureBlocks({ blockInfo: { blockNumber: value } }).getLatestBlockNumber(), INVALID_BLOCK_NUMBER);
    }
});
