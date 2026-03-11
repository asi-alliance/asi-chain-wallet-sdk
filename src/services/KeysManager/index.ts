import { utils, getPublicKey } from "@noble/secp256k1";

export interface KeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}

export default class KeysManager {
    public static generateKeyPair(): KeyPair {
        const privateKey = utils.randomBytes(32);
        const publicKey = getPublicKey(privateKey);

        return { privateKey, publicKey };
    }

    public static getKeyPairFromPrivateKey(privateKey: Uint8Array): KeyPair {
        const publicKey: Uint8Array = getPublicKey(privateKey);

        return { privateKey, publicKey };
    }

    public static getPublicKeyFromPrivateKey(
        privateKey: Uint8Array,
    ): Uint8Array {
        return getPublicKey(privateKey);
    }

    public static generateMpcKeyPair() {
        throw new Error("MPC key generation is not implemented yet.");
    }
}
