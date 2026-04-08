import * as secp from "@noble/secp256k1";
import { TinySecp256k1Interface } from "bip32";
import { sha256 } from "@noble/hashes/sha2";
import { hmac } from "@noble/hashes/hmac";

const PRIVATE_KEY_SIZE_BYTES: number = 32;
const HEX_RADIX: number = 16;
const HEX_BYTE_PADDING: number = 64;

secp.utils.hmacSha256Sync = (
    key: Uint8Array,
    ...messages: Uint8Array[]
): Uint8Array => hmac(sha256, key, secp.utils.concatBytes(...messages));

const curveOrder: bigint = secp.CURVE.n;

const bufferToBigInt = (buffer: Uint8Array): bigint =>
    BigInt("0x" + Buffer.from(buffer).toString("hex"));

const bigIntToBuffer = (num: bigint): Uint8Array =>
    Uint8Array.from(
        Buffer.from(
            num.toString(HEX_RADIX).padStart(HEX_BYTE_PADDING, "0"),
            "hex",
        ),
    );

const ecc: TinySecp256k1Interface = {
    isPoint(publicKeyBytes: Uint8Array): boolean {
        try {
            secp.Point.fromHex(publicKeyBytes);
            return true;
        } catch {
            return false;
        }
    },

    isPrivate(privateKeyBytes: Uint8Array): boolean {
        if (privateKeyBytes.length !== PRIVATE_KEY_SIZE_BYTES) {
            return false;
        }

        const privateKeyNumber: bigint = bufferToBigInt(privateKeyBytes);

        return privateKeyNumber > 0n && privateKeyNumber < curveOrder;
    },

    pointFromScalar(
        privateKeyBytes: Uint8Array,
        compressed: boolean = true,
    ): Uint8Array | null {
        try {
            return secp.getPublicKey(privateKeyBytes, compressed);
        } catch {
            return null;
        }
    },

    pointAddScalar(
        publicKeyPoint: Uint8Array,
        tweakValue: Uint8Array,
        compressed: boolean = true,
    ): Uint8Array | null {
        try {
            const publicKeyPointObject: secp.Point =
                secp.Point.fromHex(publicKeyPoint);
            const tweakNumber: bigint = bufferToBigInt(tweakValue);
            const tweakPointObject: secp.Point =
                secp.Point.BASE.multiply(tweakNumber);
            const resultPoint: secp.Point =
                publicKeyPointObject.add(tweakPointObject);

            return resultPoint.toRawBytes(compressed);
        } catch {
            return null;
        }
    },

    privateAdd(
        privateKeyBytes: Uint8Array,
        tweakValue: Uint8Array,
    ): Uint8Array | null {
        const privateKeyNumber: bigint = bufferToBigInt(privateKeyBytes);
        const tweakNumber: bigint = bufferToBigInt(tweakValue);
        const result: bigint = (privateKeyNumber + tweakNumber) % curveOrder;

        if (result === 0n) {
            return null;
        }

        return bigIntToBuffer(result);
    },

    privateNegate(privateKeyBytes: Uint8Array): Uint8Array {
        const privateKeyNumber: bigint = bufferToBigInt(privateKeyBytes);

        return bigIntToBuffer((curveOrder - privateKeyNumber) % curveOrder);
    },

    sign(messageHash: Uint8Array, privateKeyBytes: Uint8Array): Uint8Array {
        return secp.signSync(messageHash, privateKeyBytes, { der: false });
    },

    verify(
        messageHash: Uint8Array,
        publicKeyPoint: Uint8Array,
        signature: Uint8Array,
    ): boolean {
        return secp.verify(signature, messageHash, publicKeyPoint);
    },
};

export default ecc;
