import { getPublicKey, utils } from "@noble/secp256k1";
import { PRIVATE_KEY_LENGTH } from "@/domain/constants";
import type {
    IKeyManager,
    KeyPair,
} from "@/domain/services/KeyManagement";

const { bytesToHex, randomBytes } = utils;

export class Secp256k1KeysManagerAdapter implements IKeyManager {
    public static generateRandomKey(
        length: number = PRIVATE_KEY_LENGTH,
    ): Uint8Array {
        Secp256k1KeysManagerAdapter.assertPositiveInteger(length);

        return randomBytes(length);
    }

    public static generateKeyPair(
        keyLength: number = PRIVATE_KEY_LENGTH,
    ): KeyPair {
        Secp256k1KeysManagerAdapter.assertPositiveInteger(keyLength);

        const privateKey: Uint8Array = randomBytes(keyLength);
        const publicKey: Uint8Array = getPublicKey(privateKey);

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

    public static convertKeyToHex(key: Uint8Array): string {
        return bytesToHex(key);
    }

    public generateRandomKey(length?: number): Uint8Array {
        return Secp256k1KeysManagerAdapter.generateRandomKey(length);
    }

    public generateKeyPair(keyLength?: number): KeyPair {
        return Secp256k1KeysManagerAdapter.generateKeyPair(keyLength);
    }

    public getKeyPairFromPrivateKey(privateKey: Uint8Array): KeyPair {
        return Secp256k1KeysManagerAdapter.getKeyPairFromPrivateKey(privateKey);
    }

    public getPublicKeyFromPrivateKey(privateKey: Uint8Array): Uint8Array {
        return Secp256k1KeysManagerAdapter.getPublicKeyFromPrivateKey(
            privateKey,
        );
    }

    public convertKeyToHex(key: Uint8Array): string {
        return Secp256k1KeysManagerAdapter.convertKeyToHex(key);
    }

    private static assertPositiveInteger(value: number): void {
        if (value <= 0 || !Number.isInteger(value)) {
            throw new Error("PrivateKeyLength must be a positive integer");
        }
    }
}

export default Secp256k1KeysManagerAdapter;
