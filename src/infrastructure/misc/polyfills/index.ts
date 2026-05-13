import { Buffer } from "buffer";

export const setupBufferPolyfill = () => {
    if (typeof window !== "undefined" && !(window as any).Buffer) {
        (window as any).Buffer = Buffer;
    }
};
