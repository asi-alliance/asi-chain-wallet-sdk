import { ASI_BASE_UNIT } from "@utils/constants";

const REGEX_THOUSANDS: RegExp = /[,\s]+/g;
const REGEX_AMOUNT_FORMAT: RegExp = /^\d+(?:\.\d+)?$/;
const REGEX_TRIM_TRAILING_ZEROS: RegExp = /(\.\d*?[1-9])0+$/;
const REGEX_DOT_ZERO: RegExp = /\.0+$/;

export const toAtomicAmount = (amount: number | string): bigint => {
    const decimals: number = ASI_BASE_UNIT.toString().length - 1;

    if (typeof amount === "number") {
        if (!Number.isFinite(amount)) {
            throw new Error("Invalid number");
        }
        amount = String(amount);
    }

    let amountString: string = String(amount).trim();

    if (!amountString.length) {
        throw new Error("Cannot process empty amount");
    }

    let isNegative: boolean = false;

    if (amountString.startsWith("-")) {
        isNegative = true;
        amountString = amountString.slice(1);
    }

    amountString = amountString.replace(REGEX_THOUSANDS, "");

    if (!REGEX_AMOUNT_FORMAT.test(amountString)) {
        throw new Error("Invalid amount format");
    }

    const [integerPartRaw, fractionRaw = ""]: string[] =
        amountString.split(".");
    const integerPart: string = integerPartRaw || "0";

    let fraction: string = fractionRaw;

    if (fraction.length > decimals) {
        console.warn(
            `Fraction ${fraction} has more than allowed decimals; truncating`,
        );

        fraction = fraction.slice(0, decimals);
    }

    fraction = fraction.padEnd(decimals, "0");

    const result: bigint =
        BigInt(integerPart) * ASI_BASE_UNIT + BigInt(fraction || "0");

    return isNegative ? -result : result;
};

export const fromAtomicAmountToString = (atomicAmount: bigint): string => {
    const integerPart: bigint = atomicAmount / ASI_BASE_UNIT;
    const remainder: bigint = atomicAmount % ASI_BASE_UNIT;

    const baseString: string = ASI_BASE_UNIT.toString();
    const decimals: number = baseString.length - 1;

    const fraction: string = remainder.toString().padStart(decimals, "0");
    const resultSting: string = `${integerPart.toString()}.${fraction}`;

    return resultSting
        .replace(REGEX_TRIM_TRAILING_ZEROS, "$1")
        .replace(REGEX_DOT_ZERO, "");
};

export const fromAtomicAmountToNumber = (atomicAmount: bigint): number => {
    const integerPart: bigint = atomicAmount / ASI_BASE_UNIT;
    const remainder: bigint = atomicAmount % ASI_BASE_UNIT;

    if (integerPart > BigInt(Number.MAX_SAFE_INTEGER)) {
        console.warn(
            "Integer part exceeds Number.MAX_SAFE_INTEGER; returning imprecise Number",
        );

        return Number(fromAtomicAmountToString(atomicAmount));
    }

    return Number(integerPart) + Number(remainder) / Number(ASI_BASE_UNIT);
};

export const fromAtomicAmount = fromAtomicAmountToString;

export const genRandomHex = (size: number) =>
    [...Array(size)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");
