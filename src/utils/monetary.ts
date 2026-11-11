import { NodeApiProfile } from "@domains/NodeApiProfile";
import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "@config/index";

export type PhloPrice = number | string | bigint;

export const MAX_TOKEN_AMOUNT = (1n << 256n) - 1n;

export const parseTokenAmount = (value: unknown): bigint => {
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
            throw new RangeError("Token amount number must be a non-negative safe integer");
        }
    } else if (typeof value === "string") {
        if (value.length > 78 || !/^(0|[1-9]\d*)$/.test(value)) {
            throw new RangeError("Token amount must be a canonical uint256 decimal string");
        }
    } else if (typeof value !== "bigint") {
        throw new TypeError("Token amount must be an exact integer");
    }
    const amount = BigInt(value);
    if (amount < 0n || amount > MAX_TOKEN_AMOUNT) {
        throw new RangeError("Token amount exceeds uint256");
    }
    return amount;
};

export const encodeTokenAmount = (value: unknown): Uint8Array => {
    let amount = parseTokenAmount(value);
    const bytes = new Uint8Array(32);
    for (let index = 31; index >= 0; index--) {
        bytes[index] = Number(amount & 255n);
        amount >>= 8n;
    }
    return bytes;
};

export const resolveDeployPhlo = (
    details: { phloLimit?: number; phloPrice?: PhloPrice },
    profile: NodeApiProfile,
): { phloLimit: number; phloPrice: number | string; charge: bigint } => {
    if (!Object.values(NodeApiProfile).includes(profile)) {
        throw new Error("Unknown node API profile");
    }
    const phloLimit = details.phloLimit === undefined ? DEFAULT_PHLO_LIMIT : details.phloLimit;
    if (!Number.isSafeInteger(phloLimit) || phloLimit <= 0) {
        throw new RangeError("Phlo limit must be a positive safe integer");
    }
    const value = details.phloPrice === undefined ? DEFAULT_PHLO_PRICE : details.phloPrice;
    if (profile !== NodeApiProfile.RUST &&
        (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)) {
        throw new RangeError("Phlo price must be a positive safe integer for a classic profile");
    }
    const price = parseTokenAmount(value);
    if (price === 0n) throw new RangeError("Phlo price must be positive");
    const charge = BigInt(phloLimit) * price;
    if (profile === NodeApiProfile.RUST && charge > MAX_TOKEN_AMOUNT) {
        throw new RangeError("Maximum phlo charge exceeds uint256");
    }
    return {
        phloLimit,
        phloPrice: profile === NodeApiProfile.RUST ? price.toString() : value as number,
        charge,
    };
};
