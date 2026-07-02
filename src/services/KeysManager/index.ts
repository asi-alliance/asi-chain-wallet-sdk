import Bip44Path from "@domains/Bip44Path";
import KeyDerivationService from "@services/KeyDerivation";
import { ASI_COIN_TYPE, PRIVATE_KEY_LENGTH } from "@utils/constants";
import { isCustomCreateHDWalletOptions } from "@utils/guards";
import { TCreateHDPathWalletOptions } from "@domains/Wallet";
import { utils, getPublicKey } from "@noble/secp256k1";

const { randomBytes, bytesToHex } = utils;

export type KeyPair = {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
};

export interface IBaseHDWalletPrivateKeyData {
    path: Bip44Path;
    privateKey: Uint8Array;
}

export interface IHDWalletPrivateKeyDataFromMnemonic extends IBaseHDWalletPrivateKeyData {
    seed: Uint8Array;
}

export interface IHDWalletPrivateKeyDataFromSeed extends IBaseHDWalletPrivateKeyData {
    index: number;
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
        const privateKey: Uint8Array = this.generateRandomKey(keyLength);
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

    public static async getInitialHDPathFromOptions(
        hdWalletOptions: TCreateHDPathWalletOptions,
    ): Promise<Bip44Path> {
        return !isCustomCreateHDWalletOptions(hdWalletOptions)
            ? new Bip44Path({
                  coinType: ASI_COIN_TYPE,
                  account: 0,
                  change: 0,
                  index: hdWalletOptions.index,
              })
            : hdWalletOptions.customHDPath;
    }

    public static async getPrivateDataFromSeed(
        seed: Uint8Array,
        path: Bip44Path,
    ): Promise<IHDWalletPrivateKeyDataFromSeed> {
        const masterNode = KeyDerivationService.seedToMasterNode(seed);

        return {
            privateKey: KeyDerivationService.derivePrivateKey(masterNode, path),
            path,
            index: path.getIndex(),
        };
    }
}
