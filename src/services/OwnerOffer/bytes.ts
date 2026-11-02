// Byte helpers of the owner-direct offer encoder.
//
// The encoder must compile for an ES5 target, so this module uses no bigint
// values. Integers are JavaScript numbers that are safe integers
// (0 <= value <= 2^53 - 1). The 128-bit REV ceiling is computed exactly with
// 16-bit limbs and is kept as 16 big-endian bytes.

export const MAX_SAFE_INTEGER: number = 9007199254740991;

const TWO_POW_16: number = 65536;
const TWO_POW_32: number = 4294967296;
const HEX_ALPHABET: string = "0123456789abcdef";
const BASE64_ALPHABET: string =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE58_ALPHABET: string =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export class OwnerOfferError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OwnerOfferError";
        Object.setPrototypeOf(this, OwnerOfferError.prototype);
    }
}

export const isSafeUnsigned = (value: number): boolean =>
    typeof value === "number" &&
    Math.floor(value) === value &&
    value >= 0 &&
    value <= MAX_SAFE_INTEGER;

export const requireSafeUnsigned = (value: number, name: string): number => {
    if (!isSafeUnsigned(value)) {
        throw new OwnerOfferError(
            `${name} must be an integer from 0 to 2^53 - 1`,
        );
    }

    return value;
};

export const concatBytes = (parts: ReadonlyArray<Uint8Array>): Uint8Array => {
    let length: number = 0;

    for (let index = 0; index < parts.length; index += 1) {
        length += parts[index].length;
    }

    const output: Uint8Array = new Uint8Array(length);
    let offset: number = 0;

    for (let index = 0; index < parts.length; index += 1) {
        output.set(parts[index], offset);
        offset += parts[index].length;
    }

    return output;
};

export const asciiBytes = (value: string): Uint8Array => {
    const output: Uint8Array = new Uint8Array(value.length);

    for (let index = 0; index < value.length; index += 1) {
        const code: number = value.charCodeAt(index);

        if (code > 0x7f) {
            throw new OwnerOfferError("a domain separator must be ASCII");
        }

        output[index] = code;
    }

    return output;
};

export const utf8Bytes = (value: string): Uint8Array =>
    new TextEncoder().encode(value);

export const u8be = (value: number): Uint8Array => {
    if (!isSafeUnsigned(value) || value > 0xff) {
        throw new OwnerOfferError("a u8 field is out of range");
    }

    return new Uint8Array([value]);
};

export const u16be = (value: number): Uint8Array => {
    if (!isSafeUnsigned(value) || value > 0xffff) {
        throw new OwnerOfferError("a u16 field is out of range");
    }

    return new Uint8Array([(value >>> 8) & 0xff, value & 0xff]);
};

export const u32be = (value: number): Uint8Array => {
    if (!isSafeUnsigned(value) || value > 0xffffffff) {
        throw new OwnerOfferError("a u32 field is out of range");
    }

    return new Uint8Array([
        Math.floor(value / 0x1000000) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    ]);
};

export const u64be = (value: number): Uint8Array => {
    requireSafeUnsigned(value, "a u64 field");

    const high: number = Math.floor(value / TWO_POW_32);
    const low: number = value - high * TWO_POW_32;
    const output: Uint8Array = new Uint8Array(8);

    output.set(u32be(high), 0);
    output.set(u32be(low), 4);

    return output;
};

// Reads a big-endian unsigned integer of at most 8 bytes. It returns -1 when
// the value is above 2^53 - 1, so that callers can refuse it.
export const readUnsignedBE = (bytes: Uint8Array): number => {
    let value: number = 0;

    for (let index = 0; index < bytes.length; index += 1) {
        value = value * 256 + bytes[index];

        if (value > MAX_SAFE_INTEGER) {
            return -1;
        }
    }

    return value;
};

const toLimbs16 = (value: number): number[] => {
    const limbs: number[] = [0, 0, 0, 0];
    let remaining: number = value;

    for (let index = 0; index < limbs.length; index += 1) {
        limbs[index] = remaining % TWO_POW_16;
        remaining = Math.floor(remaining / TWO_POW_16);
    }

    return limbs;
};

// Computes left * right + addend exactly as a 128-bit unsigned integer and
// returns its 16 big-endian bytes. Every partial sum stays below 2^35, so
// each step is exact in double precision.
export const u128MultiplyAdd = (
    left: number,
    right: number,
    addend: number,
): Uint8Array => {
    requireSafeUnsigned(left, "a u128 factor");
    requireSafeUnsigned(right, "a u128 factor");
    requireSafeUnsigned(addend, "a u128 addend");

    const leftLimbs: number[] = toLimbs16(left);
    const rightLimbs: number[] = toLimbs16(right);
    const addendLimbs: number[] = toLimbs16(addend);
    const limbs: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < leftLimbs.length; i += 1) {
        for (let j = 0; j < rightLimbs.length; j += 1) {
            limbs[i + j] += leftLimbs[i] * rightLimbs[j];
        }
    }

    for (let index = 0; index < addendLimbs.length; index += 1) {
        limbs[index] += addendLimbs[index];
    }

    for (let index = 0; index < limbs.length - 1; index += 1) {
        const carry: number = Math.floor(limbs[index] / TWO_POW_16);

        limbs[index] -= carry * TWO_POW_16;
        limbs[index + 1] += carry;
    }

    const output: Uint8Array = new Uint8Array(16);

    for (let index = 0; index < limbs.length; index += 1) {
        const offset: number = 14 - 2 * index;

        output[offset] = Math.floor(limbs[index] / 256) & 0xff;
        output[offset + 1] = limbs[index] & 0xff;
    }

    return output;
};

export const compareBytes = (left: Uint8Array, right: Uint8Array): number => {
    const length: number = Math.min(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
        if (left[index] !== right[index]) {
            return left[index] < right[index] ? -1 : 1;
        }
    }

    if (left.length === right.length) {
        return 0;
    }

    return left.length < right.length ? -1 : 1;
};

export const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
    compareBytes(left, right) === 0;

export const bytesToHex = (bytes: Uint8Array): string => {
    let output: string = "";

    for (let index = 0; index < bytes.length; index += 1) {
        output +=
            HEX_ALPHABET.charAt(bytes[index] >>> 4) +
            HEX_ALPHABET.charAt(bytes[index] & 0x0f);
    }

    return output;
};

export const hexToBytes = (hex: string): Uint8Array => {
    const normalized: string = hex.trim().toLowerCase();

    if (normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
        throw new OwnerOfferError("a hexadecimal value is malformed");
    }

    const output: Uint8Array = new Uint8Array(normalized.length / 2);

    for (let index = 0; index < output.length; index += 1) {
        output[index] = parseInt(normalized.substr(index * 2, 2), 16);
    }

    return output;
};

// Standard base64 with padding, the form that the node's
// `/api/deploy/offered` route requires (it re-encodes and compares).
export const bytesToBase64 = (bytes: Uint8Array): string => {
    let output: string = "";
    let index: number = 0;

    for (; index + 2 < bytes.length; index += 3) {
        const chunk: number =
            (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];

        output +=
            BASE64_ALPHABET.charAt((chunk >>> 18) & 0x3f) +
            BASE64_ALPHABET.charAt((chunk >>> 12) & 0x3f) +
            BASE64_ALPHABET.charAt((chunk >>> 6) & 0x3f) +
            BASE64_ALPHABET.charAt(chunk & 0x3f);
    }

    const remaining: number = bytes.length - index;

    if (remaining === 1) {
        const chunk: number = bytes[index] << 16;

        output +=
            BASE64_ALPHABET.charAt((chunk >>> 18) & 0x3f) +
            BASE64_ALPHABET.charAt((chunk >>> 12) & 0x3f) +
            "==";
    } else if (remaining === 2) {
        const chunk: number = (bytes[index] << 16) | (bytes[index + 1] << 8);

        output +=
            BASE64_ALPHABET.charAt((chunk >>> 18) & 0x3f) +
            BASE64_ALPHABET.charAt((chunk >>> 12) & 0x3f) +
            BASE64_ALPHABET.charAt((chunk >>> 6) & 0x3f) +
            "=";
    }

    return output;
};

// Base58 with the Bitcoin alphabet, as the node's `Address::to_base58` uses.
export const bytesToBase58 = (bytes: Uint8Array): string => {
    let zeros: number = 0;

    while (zeros < bytes.length && bytes[zeros] === 0) {
        zeros += 1;
    }

    const digits: number[] = [];

    for (let index = zeros; index < bytes.length; index += 1) {
        let carry: number = bytes[index];

        for (let digit = 0; digit < digits.length; digit += 1) {
            carry += digits[digit] * 256;
            digits[digit] = carry % 58;
            carry = Math.floor(carry / 58);
        }

        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }

    let output: string = "";

    for (let index = 0; index < zeros; index += 1) {
        output += BASE58_ALPHABET.charAt(0);
    }

    for (let index = digits.length - 1; index >= 0; index -= 1) {
        output += BASE58_ALPHABET.charAt(digits[index]);
    }

    return output;
};
