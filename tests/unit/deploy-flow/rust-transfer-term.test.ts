import assert from "node:assert/strict";
import test from "node:test";

import { createRustTransferDeploy } from "@domains/Deploy/factory/rust";
import { Address } from "@domains/Wallet";
import KeysManager from "@services/KeysManager";
import WalletsService from "@services/Wallets";

const address: Address = WalletsService.deriveAddressFromPublicKey(
    KeysManager.generateKeyPair().publicKey,
);

const FIRST_ABOVE_INT64 = 1n << 63n;
const MAX_UINT256 = (1n << 256n) - 1n;
const TRANSFER_LITERAL_REGEX = /@vault!\("transfer", "[^"]+", ([0-9]+n?),/u;

test("Rust transfer terms use an exact BigInt literal above int64", () => {
    const amounts: bigint[] = [
        1n,
        FIRST_ABOVE_INT64 - 1n,
        FIRST_ABOVE_INT64,
        10n ** 19n,
        MAX_UINT256,
    ];

    for (const amount of amounts) {
        const term = createRustTransferDeploy(address, address, amount);
        const literal = TRANSFER_LITERAL_REGEX.exec(term)?.[1];

        assert.ok(literal);
        assert.equal(BigInt(literal.replace(/n$/, "")), amount);
        assert.equal(literal.endsWith("n"), amount >= FIRST_ABOVE_INT64);
    }
});

test("normal Rust transfers reject zero, negative and above-uint256 amounts", () => {
    for (const amount of [0n, -1n, MAX_UINT256 + 1n]) {
        assert.throws(() => createRustTransferDeploy(address, address, amount));
    }
});
