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

export const encodeBase16 = (bytes: Uint8Array): string => {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
        ""
    );
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
