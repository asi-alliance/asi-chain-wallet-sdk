import KeyDerivationService, {
    Bip44PathOptions,
} from "@services/KeyDerivation";
import MnemonicService from "../Mnemonic";
import { isCustomCreateHDWalletOptions } from "../../utils/guards";
import { PRIVATE_KEY_LENGTH } from "../../utils/constants";
import { utils, getPublicKey } from "@noble/secp256k1";
import { TCreateHDWalletOptions } from "@domains/Wallet";

const { randomBytes, bytesToHex } = utils;

export interface KeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}
export interface IBaseHDWalletPrivateKeyData {
    path: string;
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

    public static async deriveKeyFromMnemonic(
        mnemonicWords: string[],
        options?: Bip44PathOptions,
    ): Promise<Uint8Array> {
        return await KeyDerivationService.deriveKeyFromMnemonic(
            mnemonicWords,
            options,
        );
    }

    public static async getPrivateDataFromMnemonic(
        mnemonic: string,
        hdWalletOptions: TCreateHDWalletOptions,
    ): Promise<IHDWalletPrivateKeyDataFromMnemonic> {
        const path: string = !isCustomCreateHDWalletOptions(hdWalletOptions)
            ? KeyDerivationService.buildBip44Path({
                  coinType: 60,
                  account: 0,
                  change: 0,
                  index: hdWalletOptions.index,
              })
            : hdWalletOptions.customHDPath;

        const seed = await MnemonicService.mnemonicToSeed(mnemonic);
        const masterNode = KeyDerivationService.seedToMasterNode(seed);

        return {
            privateKey: KeyDerivationService.derivePrivateKey(masterNode, path),
            path,
            seed,
        };
    }
}
