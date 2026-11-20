import test from "node:test";
import assert from "node:assert/strict";

import { NATIVE_TOKEN_DECIMALS_AMOUNT } from "@config/index";
import {
    fromAtomicAmount,
    toAtomicAmount,
    toExactAtomicAmount,
} from "@utils/index";
import { MAX_INT64, MAX_UINT256 } from "@utils/constants";

interface IExactAmountCase {
    amount: string;
    decimals: number;
    expected: bigint;
}

const ASI_DECIMALS: number = NATIVE_TOKEN_DECIMALS_AMOUNT;
const NATIVE18_DECIMALS: number = 18;
const NO_DECIMALS: number = 0;
const SIX_DECIMALS: number = 6;

const ONE_NATIVE18_TOKEN: bigint = 10n ** 18n;
const FIRST_UNSAFE_INTEGER: bigint = 2n ** 53n + 1n;

const INVALID_AMOUNT_FORMAT_ERROR: RegExp = /Invalid amount format/;
const EXCESS_DECIMAL_PLACES_ERROR: RegExp = /more than \d+ decimal places/;
const INVALID_DECIMALS_ERROR: RegExp =
    /Decimals must be a non-negative safe integer/;

const EXACT_AMOUNT_CASES: IExactAmountCase[] = [
    { amount: "1", decimals: ASI_DECIMALS, expected: 100_000_000n },
    { amount: "1", decimals: NATIVE18_DECIMALS, expected: ONE_NATIVE18_TOKEN },
    { amount: "1.5", decimals: ASI_DECIMALS, expected: 150_000_000n },
    {
        amount: "10.000000000000000001",
        decimals: NATIVE18_DECIMALS,
        expected: 10_000_000_000_000_000_001n,
    },
    { amount: "0.00000001", decimals: ASI_DECIMALS, expected: 1n },
    {
        amount: "0.000000000000000001",
        decimals: NATIVE18_DECIMALS,
        expected: 1n,
    },
    {
        amount: String(FIRST_UNSAFE_INTEGER),
        decimals: NATIVE18_DECIMALS,
        expected: FIRST_UNSAFE_INTEGER * ONE_NATIVE18_TOKEN,
    },
    { amount: "42", decimals: NO_DECIMALS, expected: 42n },
    { amount: "-2.5", decimals: ASI_DECIMALS, expected: -250_000_000n },
    { amount: "007.10", decimals: ASI_DECIMALS, expected: 710_000_000n },
    { amount: "  3  ", decimals: ASI_DECIMALS, expected: 300_000_000n },
];

const MALFORMED_AMOUNTS: string[] = [
    "",
    " ",
    "1,5",
    "1 000",
    "1.",
    ".5",
    "1e18",
    "+1",
    "0x10",
    "--1",
    "1.2.3",
    "Infinity",
];

const INVALID_DECIMALS: number[] = [
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
];

const ROUND_TRIP_ATOMIC_AMOUNTS: bigint[] = [
    1n,
    -1n,
    FIRST_UNSAFE_INTEGER,
    MAX_INT64 + 1n,
    10n ** 19n,
    MAX_UINT256,
];

test("toExactAtomicAmount scales whole and fractional parts by the passed decimals", () => {
    console.log("\n=== EXACT AMOUNT SCALING ===");

    for (const { amount, decimals, expected } of EXACT_AMOUNT_CASES) {
        const atomicAmount: bigint = toExactAtomicAmount(amount, decimals);

        console.log(
            "    Amount:",
            JSON.stringify(amount),
            "decimals:",
            decimals,
            "atomic:",
            atomicAmount.toString(),
        );

        assert.equal(atomicAmount, expected);
    }
});

test("toExactAtomicAmount accepts zeros beyond decimals and rejects nonzero digits there", () => {
    console.log("\n=== DIGITS BEYOND DECIMALS ===");

    const paddedAmount: bigint = toExactAtomicAmount(
        "1.500000000000",
        ASI_DECIMALS,
    );

    console.log("    Padded amount:", paddedAmount.toString());

    assert.equal(paddedAmount, 150_000_000n);
    assert.throws(
        () => toExactAtomicAmount("1.000000001", ASI_DECIMALS),
        EXCESS_DECIMAL_PLACES_ERROR,
    );
    assert.throws(
        () => toExactAtomicAmount("0.0000000000000000001", NATIVE18_DECIMALS),
        EXCESS_DECIMAL_PLACES_ERROR,
    );
});

test("toExactAtomicAmount rejects malformed amounts instead of guessing", () => {
    console.log("\n=== MALFORMED AMOUNTS ===");

    for (const amount of MALFORMED_AMOUNTS) {
        console.log("    Rejecting:", JSON.stringify(amount));

        assert.throws(
            () => toExactAtomicAmount(amount, ASI_DECIMALS),
            INVALID_AMOUNT_FORMAT_ERROR,
        );
    }
});

test("toExactAtomicAmount rejects decimals that are not a non-negative safe integer", () => {
    console.log("\n=== INVALID DECIMALS ===");

    for (const decimals of INVALID_DECIMALS) {
        console.log("    Rejecting decimals:", decimals);

        assert.throws(
            () => toExactAtomicAmount("1", decimals),
            INVALID_DECIMALS_ERROR,
        );
    }
});

test("exact conversion round trips through fromAtomicAmount at 8 and 18 decimals", () => {
    console.log("\n=== EXACT ROUND TRIP ===");

    for (const decimals of [ASI_DECIMALS, NATIVE18_DECIMALS]) {
        for (const atomicAmount of ROUND_TRIP_ATOMIC_AMOUNTS) {
            const displayAmount: string = fromAtomicAmount(
                atomicAmount,
                decimals,
            );

            assert.equal(
                toExactAtomicAmount(displayAmount, decimals),
                atomicAmount,
            );
        }

        console.log("    Round trip kept every amount at decimals:", decimals);
    }
});

test("toAtomicAmount scales the integer part by the passed decimals", () => {
    console.log("\n=== LENIENT CONVERSION SCALE ===");

    const wideAmount: bigint = toAtomicAmount(
        "10.000000000000000001",
        NATIVE18_DECIMALS,
    );

    console.log("    Wide amount:", wideAmount.toString());

    assert.equal(toAtomicAmount("1", NATIVE18_DECIMALS), ONE_NATIVE18_TOKEN);
    assert.equal(
        toAtomicAmount("1.5", NATIVE18_DECIMALS),
        1_500_000_000_000_000_000n,
    );
    assert.equal(wideAmount, 10_000_000_000_000_000_001n);
    assert.equal(toAtomicAmount("2.5", SIX_DECIMALS), 2_500_000n);
});

test("toAtomicAmount keeps its lenient 8-decimal behavior", (t) => {
    console.log("\n=== LENIENT CONVERSION AT 8 DECIMALS ===");

    const warn = t.mock.method(console, "warn", () => {});

    assert.equal(toAtomicAmount("1", ASI_DECIMALS), 100_000_000n);
    assert.equal(toAtomicAmount("1,000.5", ASI_DECIMALS), 100_050_000_000n);
    assert.equal(toAtomicAmount(1.25, ASI_DECIMALS), 125_000_000n);
    assert.equal(toAtomicAmount("1.123456789", ASI_DECIMALS), 112_345_678n);

    console.log("    Warnings:", warn.mock.callCount());

    assert.equal(warn.mock.callCount(), 1);
});
