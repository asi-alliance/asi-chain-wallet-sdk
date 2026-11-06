import assert from "node:assert/strict";
import test from "node:test";

import { fromAtomicAmount, toAtomicAmount } from "@utils/functions";

const MAX_UINT256 = (1n << 256n) - 1n;

for (const [amount, decimals, expected] of [
    ["1", 18, "1000000000000000000"],
    ["1.5", 18, "1500000000000000000"],
    ["10.000000000000000001", 18, "10000000000000000001"],
    ["0.000000000000000001", 18, "1"],
    ["-10.000000000000000001", 18, "-10000000000000000001"],
    ["1.00000001", 8, "100000001"],
    ["9007199254740993.00000001", 8, "900719925474099300000001"],
    ["1.25", 2, "125"],
    ["42", 0, "42"],
] as const) {
    test(`converts ${amount} at ${decimals} decimals without narrowing`, () => {
        assert.equal(toAtomicAmount(amount, decimals), BigInt(expected));
    });
}

for (const decimals of [8, 18]) {
    test(`round-trips signed boundary amounts at ${decimals} decimals`, () => {
        for (const atomic of [
            0n, 1n, -1n, 9007199254740993n, (1n << 63n) - 1n,
            1n << 63n, (1n << 64n) - 1n, 10n ** 19n,
            MAX_UINT256, -MAX_UINT256, MAX_UINT256 + 1n,
        ]) {
            const display = fromAtomicAmount(atomic, decimals);
            assert.equal(toAtomicAmount(display, decimals), atomic, display);
        }
    });

    test(`rejects nonzero fractional digits beyond ${decimals} places`, () => {
        for (const sign of ["", "-"]) {
            assert.throws(
                () => toAtomicAmount(`${sign}1.${"0".repeat(decimals)}1`, decimals),
                /decimal places/,
            );
            assert.throws(
                () => toAtomicAmount(`${sign}0.${"0".repeat(decimals + 4)}1`, decimals),
                /decimal places/,
            );
        }
    });

    test(`normalizes only redundant trailing zeros beyond ${decimals} places`, () => {
        assert.equal(toAtomicAmount("1.230000000000000000000", decimals),
            toAtomicAmount("1.23", decimals));
        assert.equal(toAtomicAmount("-0.000000000000000000000", decimals), 0n);
        assert.equal(toAtomicAmount(`${fromAtomicAmount(MAX_UINT256, decimals)}000`, decimals), MAX_UINT256);
    });
}

test("zero-decimal assets accept redundant zeros and reject fractional value", () => {
    assert.equal(toAtomicAmount("42.000", 0), 42n);
    assert.equal(toAtomicAmount("-42.0", 0), -42n);
    assert.equal(fromAtomicAmount(42n, 0), "42");
    assert.throws(() => toAtomicAmount("42.001", 0), /decimal places/);
});

test("retains signed grouped-string compatibility", () => {
    assert.equal(toAtomicAmount(" -1,234.500000000000000000 ", 18), -1234500000000000000000n);
    assert.equal(toAtomicAmount("1 234.5", 2), 123450n);
});

test("safe integer numbers remain supported at the supplied scale", () => {
    assert.equal(toAtomicAmount(0, 18), 0n);
    assert.equal(toAtomicAmount(42, 18), 42000000000000000000n);
    assert.equal(toAtomicAmount(Number.MAX_SAFE_INTEGER, 0), 9007199254740991n);
    assert.equal(toAtomicAmount(-Number.MAX_SAFE_INTEGER, 18), -9007199254740991000000000000000000n);
});

test("requires strings for fractional or unsafe numeric amounts", () => {
    for (const amount of [
        0.1, 0.5, -1.25, Number.MAX_SAFE_INTEGER + 1,
        -(Number.MAX_SAFE_INTEGER + 1), NaN, Infinity, -Infinity,
    ]) {
        assert.throws(() => toAtomicAmount(amount, 18), /safe integer|decimal string/);
    }
    assert.equal(toAtomicAmount("0.1", 18), 100000000000000000n);
    assert.equal(toAtomicAmount("9007199254740993", 18), 9007199254740993000000000000000000n);
});

test("rejects invalid decimals before amount conversion", () => {
    for (const decimals of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => toAtomicAmount("1", decimals), RangeError);
        assert.throws(() => fromAtomicAmount(1n, decimals), RangeError);
    }
    assert.throws(() => toAtomicAmount("1", "18" as unknown as number), RangeError);
});

test("rejects malformed strings and non-string/non-number inputs", () => {
    for (const amount of ["", " ", "1e18", "1.2.3", "--1", "+1", "Infinity", "NaN"]) {
        assert.throws(() => toAtomicAmount(amount, 18));
    }
    for (const amount of [null, undefined, true, 1n, ["1"], { toString: () => "1" }]) {
        assert.throws(() => toAtomicAmount(amount as unknown as string, 18), TypeError);
    }
});
