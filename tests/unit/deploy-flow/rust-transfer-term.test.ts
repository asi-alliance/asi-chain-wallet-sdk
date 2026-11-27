import test from "node:test";
import assert from "node:assert/strict";

import { createRustTransferDeploy } from "@domains/Deploy/factory/rust";
import { Address } from "@domains/Wallet";
import KeysManager from "@services/KeysManager";
import WalletsService from "@services/Wallets";
import { MAX_INT64, MAX_UINT256 } from "@utils/constants";

interface IRejectedAmountCase {
    amount: bigint;
    error: RegExp;
}

const FIRST_ABOVE_INT64: bigint = MAX_INT64 + 1n;

const TRANSFER_LITERAL_REGEX: RegExp =
    /@vault!\("transfer", "[^"]+", ([0-9]+n?),/u;
const BIGINT_LITERAL_SUFFIX_REGEX: RegExp = /n$/;
const BIGINT_LITERAL_SUFFIX: string = "n";

const NON_POSITIVE_AMOUNT_ERROR: RegExp = /must be greater than zero/;
const ABOVE_UINT256_AMOUNT_ERROR: RegExp = /exceeds uint256/;

const TRANSFER_AMOUNTS: bigint[] = [
    1n,
    MAX_INT64,
    FIRST_ABOVE_INT64,
    10n ** 19n,
    MAX_UINT256,
];

const REJECTED_AMOUNT_CASES: IRejectedAmountCase[] = [
    { amount: 0n, error: NON_POSITIVE_AMOUNT_ERROR },
    { amount: -1n, error: NON_POSITIVE_AMOUNT_ERROR },
    { amount: MAX_UINT256 + 1n, error: ABOVE_UINT256_AMOUNT_ERROR },
];

const address: Address = WalletsService.deriveAddressFromPublicKey(
    KeysManager.generateKeyPair().publicKey,
);

test("rust transfer terms use an exact BigInt literal above int64", () => {
    console.log("\n=== RUST TRANSFER AMOUNT LITERAL ===");

    for (const amount of TRANSFER_AMOUNTS) {
        const term: string = createRustTransferDeploy(address, address, amount);
        const literal: string | undefined =
            TRANSFER_LITERAL_REGEX.exec(term)?.[1];

        console.log("    Amount literal:", literal);

        assert.ok(literal);
        assert.equal(
            BigInt(literal.replace(BIGINT_LITERAL_SUFFIX_REGEX, "")),
            amount,
        );
        assert.equal(
            literal.endsWith(BIGINT_LITERAL_SUFFIX),
            amount > MAX_INT64,
        );
    }
});

test("normal rust transfers reject zero, negative and above-uint256 amounts", () => {
    console.log("\n=== RUST TRANSFER AMOUNT BOUNDS ===");

    for (const { amount, error } of REJECTED_AMOUNT_CASES) {
        console.log("    Rejecting amount:", amount.toString());

        assert.throws(
            () => createRustTransferDeploy(address, address, amount),
            error,
        );
    }
});
