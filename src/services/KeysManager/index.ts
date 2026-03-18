import KeyDerivationService, {
    Bip44PathOptions,
} from "@services/KeyDerivation";
import { PRIVATE_KEY_LENGTH } from "@utils/constants";
import { utils, getPublicKey } from "@noble/secp256k1";

const { randomBytes, bytesToHex } = utils;

export interface KeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}

export default class KeysManager {
    public static generateRandomKey(
        length: number = PRIVATE_KEY_LENGTH,
    ): Uint8Array {
        if (!length || length < 0 || !Number.isInteger(length)) {
            throw new Error("PrivateKeyLength must be a positive integer");
        }

        return randomBytes(length);
    }

    public static generateKeyPair(
        keyLength: number = PRIVATE_KEY_LENGTH,
    ): KeyPair {
        if (!length || length < 0 || !Number.isInteger(length)) {
            throw new Error("PrivateKeyLength must be a positive integer");
        }

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

    public static async deriveKeyFromMnemonic(
        mnemonicWords: string[],
        options?: Bip44PathOptions,
    ): Promise<Uint8Array> {
        return await KeyDerivationService.deriveKeyFromMnemonic(
            mnemonicWords,
            options,
        );
    }

    public static generateMpcKeyPair(): any {
        throw new Error("MPC key generation is not implemented yet.");
    }
}
