import { bigIntToBuffer, bufferToBigInt } from "@utils/codec";
import { PRIVATE_KEY_LENGTH } from "@utils/constants";
import { TinySecp256k1Interface } from "bip32";
import { sha256 } from "@noble/hashes/sha2";
import { hmac } from "@noble/hashes/hmac";
import {
    CURVE,
    Point,
    getPublicKey,
    signSync,
    verify,
    utils,
} from "@noble/secp256k1";

utils.hmacSha256Sync = (
    key: Uint8Array,
    ...messages: Uint8Array[]
): Uint8Array => hmac(sha256, key, utils.concatBytes(...messages));

const CURVE_ORDER: Readonly<bigint> = CURVE.n;

const ECC: TinySecp256k1Interface = {
    isPoint(publicKeyBytes: Uint8Array): boolean {
        try {
            Point.fromHex(publicKeyBytes);

            return true;
        } catch {
            return false;
        }
    },

    isPrivate(privateKeyBytes: Uint8Array): boolean {
        if (privateKeyBytes.length !== PRIVATE_KEY_LENGTH) {
            return false;
        }

        const privateKeyNumber: bigint = bufferToBigInt(privateKeyBytes);

        return privateKeyNumber > 0n && privateKeyNumber < CURVE_ORDER;
    },

    pointFromScalar(
        privateKeyBytes: Uint8Array,
        compressed: boolean = true,
    ): Uint8Array | null {
        try {
            return getPublicKey(privateKeyBytes, compressed);
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
            const publicKeyPointObject: Point = Point.fromHex(publicKeyPoint);

            const tweakNumber: bigint = bufferToBigInt(tweakValue);

            const tweakPointObject: Point = Point.BASE.multiply(tweakNumber);

            const resultPoint: Point =
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

        const result: bigint = (privateKeyNumber + tweakNumber) % CURVE_ORDER;

        if (result === 0n) {
            return null;
        }

        return bigIntToBuffer(result);
    },

    privateNegate(privateKeyBytes: Uint8Array): Uint8Array {
        const privateKeyNumber: bigint = bufferToBigInt(privateKeyBytes);

        return bigIntToBuffer((CURVE_ORDER - privateKeyNumber) % CURVE_ORDER);
    },

    sign(messageHash: Uint8Array, privateKeyBytes: Uint8Array): Uint8Array {
        return signSync(messageHash, privateKeyBytes, { der: false });
    },

    verify(
        messageHash: Uint8Array,
        publicKeyPoint: Uint8Array,
        signature: Uint8Array,
    ): boolean {
        return verify(signature, messageHash, publicKeyPoint);
    },
};

export default ECC;
