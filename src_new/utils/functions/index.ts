import { ASI_BASE_UNIT, POWER_BASE } from "@utils/constants";

export const genRandomHex = (size: number) =>
    [...Array(size)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");

export const generateRandomId = (): string => {
    return `res_${Date.now()}_${genRandomHex(8)}`;
};

const REGEX_THOUSANDS: RegExp = /[,\s]+/g;
const REGEX_AMOUNT_FORMAT: RegExp = /^\d+(?:\.\d+)?$/;
const REGEX_TRIM_TRAILING_ZEROS: RegExp = /(\.\d*?[1-9])0+$/;
const REGEX_DOT_ZERO: RegExp = /\.0+$/;

export const toAtomicAmount = (
    amount: number | string,
    decimals: number,
): bigint => {
    const baseUnit: BigInt = BigInt(POWER_BASE) ** BigInt(decimals);
    const currentDecimals: number = baseUnit.toString().length - 1;

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

    if (fraction.length > currentDecimals) {
        console.warn(
            `Fraction ${fraction} has more than allowed decimals; truncating`,
        );

        fraction = fraction.slice(0, currentDecimals);
    }

    fraction = fraction.padEnd(currentDecimals, "0");

    const result: bigint =
        BigInt(integerPart) * ASI_BASE_UNIT + BigInt(fraction || "0");

    return isNegative ? -result : result;
};

const fromAtomicAmountToString = (
    atomicAmount: bigint,
    decimals: number,
): string => {
    const isNegative: boolean = atomicAmount < 0n;
    const normalizedAtomicAmount: bigint = isNegative
        ? -atomicAmount
        : atomicAmount;

    const baseUnit: bigint = BigInt(POWER_BASE) ** BigInt(decimals);

    const integerPart: bigint = normalizedAtomicAmount / baseUnit;
    const remainder: bigint = normalizedAtomicAmount % baseUnit;

    const baseString: string = baseUnit.toString();
    const currentDecimals: number = baseString.length - 1;

    const fraction: string = remainder
        .toString()
        .padStart(currentDecimals, "0");
    const sign: string = isNegative ? "-" : "";
    const resultSting: string = `${sign}${integerPart.toString()}.${fraction}`;

    return resultSting
        .replace(REGEX_TRIM_TRAILING_ZEROS, "$1")
        .replace(REGEX_DOT_ZERO, "");
};

export const fromAtomicAmountToNumber = (
    atomicAmount: bigint,
    decimals: number,
): number => {
    const baseUnit: bigint = BigInt(POWER_BASE) ** BigInt(decimals);

    const integerPart: bigint = atomicAmount / baseUnit;
    const remainder: bigint = atomicAmount % baseUnit;

    if (integerPart > BigInt(Number.MAX_SAFE_INTEGER)) {
        console.warn(
            "Integer part exceeds Number.MAX_SAFE_INTEGER; returning imprecise Number",
        );

        return Number(fromAtomicAmountToString(atomicAmount, decimals));
    }

    return Number(integerPart) + Number(remainder) / Number(baseUnit);
};

export const fromAtomicAmount = fromAtomicAmountToString;

export const stringifyPrivateKeyToUnitArray = (value: unknown): Uint8Array => {
    if (value instanceof Uint8Array) {
        return value;
    }

    if (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "Buffer" &&
        "data" in value &&
        Array.isArray(value.data)
    ) {
        return Uint8Array.from(value.data);
    }

    if (Array.isArray(value)) {
        return Uint8Array.from(value);
    }

    if (typeof value === "object" && value !== null) {
        return Uint8Array.from(Object.values(value));
    }

    throw new Error("Unsupported private key format");
};
