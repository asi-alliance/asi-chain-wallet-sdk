import bs58 from "bs58";
import { HEX_BYTE_PADDING, HEX_RADIX } from "@utils/constants";
import { isValidByte } from "@utils/guards";

export const encodeBase58 = (hex: string): string => {
    const bytes = decodeBase16(hex);
    return bs58.encode(bytes);
};

export const decodeBase58 = (value: string): Uint8Array => {
    return bs58.decode(value);
};

export const decodeBase16 = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
};

export const encodeBase16 = (bytes: Uint8Array): string => {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
    );
};

export const toUint8Array = (value: unknown): Uint8Array => {
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
        if (!value.data.every(isValidByte)) {
            throw new Error("Invalid byte value");
        }

        return Uint8Array.from(value.data);
    }

    if (Array.isArray(value)) {
        if (!value.every(isValidByte)) {
            throw new Error("Invalid byte value");
        }

        return Uint8Array.from(value);
    }

    if (typeof value === "object" && value !== null) {
        const values = Object.values(value);

        if (!values.every(isValidByte)) {
            throw new Error("Invalid byte value");
        }

        return Uint8Array.from(values);
    }

    throw new Error("Unsupported data format");
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary: string = "";

    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary: string = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
};

export const bufferToBigInt = (buffer: Uint8Array): bigint =>
    BigInt("0x" + Buffer.from(buffer).toString("hex"));

export const bigIntToBuffer = (num: bigint): Uint8Array =>
    Uint8Array.from(
        Buffer.from(
            num.toString(HEX_RADIX).padStart(HEX_BYTE_PADDING, "0"),
            "hex",
        ),
    );
