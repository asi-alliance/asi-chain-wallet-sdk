import assert from "node:assert/strict";
import test from "node:test";

import {
    fromAtomicAmount,
    toAtomicAmount,
    toExactAtomicAmount,
} from "@utils/index";

const ASI_DECIMALS = 8;
const NATIVE18_DECIMALS = 18;
const ONE_NATIVE18_TOKEN = 10n ** 18n;
const FIRST_UNSAFE_INTEGER = 2n ** 53n + 1n;
const MAX_UINT256 = (1n << 256n) - 1n;

test("toExactAtomicAmount scales whole and fractional parts by the passed decimals", () => {
    const cases: [string, number, bigint][] = [
        ["1", ASI_DECIMALS, 100_000_000n],
        ["1", NATIVE18_DECIMALS, ONE_NATIVE18_TOKEN],
        ["1.5", ASI_DECIMALS, 150_000_000n],
        [
            "10.000000000000000001",
            NATIVE18_DECIMALS,
            10_000_000_000_000_000_001n,
        ],
        ["0.00000001", ASI_DECIMALS, 1n],
        ["0.000000000000000001", NATIVE18_DECIMALS, 1n],
        [
            String(FIRST_UNSAFE_INTEGER),
            NATIVE18_DECIMALS,
            FIRST_UNSAFE_INTEGER * ONE_NATIVE18_TOKEN,
        ],
        ["42", 0, 42n],
        ["-2.5", ASI_DECIMALS, -250_000_000n],
        ["007.10", ASI_DECIMALS, 710_000_000n],
        ["  3  ", ASI_DECIMALS, 300_000_000n],
    ];

    for (const [amount, decimals, expected] of cases) {
        assert.equal(toExactAtomicAmount(amount, decimals), expected);
    }
});

test("toExactAtomicAmount accepts zeros beyond decimals and rejects nonzero digits there", () => {
    assert.equal(
        toExactAtomicAmount("1.500000000000", ASI_DECIMALS),
        150_000_000n,
    );

    assert.throws(
        () => toExactAtomicAmount("1.000000001", ASI_DECIMALS),
        RangeError,
    );
    assert.throws(
        () => toExactAtomicAmount("0.0000000000000000001", NATIVE18_DECIMALS),
        RangeError,
    );
});

test("toExactAtomicAmount rejects malformed amounts instead of guessing", () => {
    const malformed: string[] = [
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

    for (const amount of malformed) {
        assert.throws(() => toExactAtomicAmount(amount, ASI_DECIMALS), Error);
    }
});

test("toExactAtomicAmount rejects decimals that are not a non-negative safe integer", () => {
    for (const decimals of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(() => toExactAtomicAmount("1", decimals), RangeError);
    }
});

test("exact conversion round trips through fromAtomicAmount at 8 and 18 decimals", () => {
    const atomicAmounts: bigint[] = [
        1n,
        -1n,
        FIRST_UNSAFE_INTEGER,
        2n ** 63n,
        10n ** 19n,
        MAX_UINT256,
    ];

    for (const decimals of [ASI_DECIMALS, NATIVE18_DECIMALS]) {
        for (const atomicAmount of atomicAmounts) {
            assert.equal(
                toExactAtomicAmount(
                    fromAtomicAmount(atomicAmount, decimals),
                    decimals,
                ),
                atomicAmount,
            );
        }
    }
});

test("toAtomicAmount scales the integer part by the passed decimals", () => {
    assert.equal(toAtomicAmount("1", NATIVE18_DECIMALS), ONE_NATIVE18_TOKEN);
    assert.equal(
        toAtomicAmount("1.5", NATIVE18_DECIMALS),
        1_500_000_000_000_000_000n,
    );
    assert.equal(
        toAtomicAmount("10.000000000000000001", NATIVE18_DECIMALS),
        10_000_000_000_000_000_001n,
    );
    assert.equal(toAtomicAmount("2.5", 6), 2_500_000n);
});

test("toAtomicAmount keeps its lenient 8-decimal behavior", (t) => {
    const warn = t.mock.method(console, "warn", () => {});

    assert.equal(toAtomicAmount("1", ASI_DECIMALS), 100_000_000n);
    assert.equal(toAtomicAmount("1,000.5", ASI_DECIMALS), 100_050_000_000n);
    assert.equal(toAtomicAmount(1.25, ASI_DECIMALS), 125_000_000n);
    assert.equal(toAtomicAmount("1.123456789", ASI_DECIMALS), 112_345_678n);
    assert.equal(warn.mock.callCount(), 1);
});
