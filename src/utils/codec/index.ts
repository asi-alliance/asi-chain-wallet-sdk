import bs58 from "bs58";

export const encodeBase58 = (hex: string): string => {
    const bytes = decodeBase16(hex);
    return bs58.encode(bytes);
};

export const decodeBase16 = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
};
