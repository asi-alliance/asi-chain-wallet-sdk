import * as tinysecp from "tiny-secp256k1";
import bip32, { BIP32Interface } from "bip32";
import MnemonicService from "@services/Mnemonic";
import { ASI_COIN_TYPE, DEFAULT_BIP_44_PATH_OPTIONS } from "@utils/constants";
import { setupBufferPolyfill } from "@utils/polyfills";
import { mnemonicToSeed } from "bip39";

setupBufferPolyfill();

const { BIP32Factory } = bip32 as unknown as {
    BIP32Factory: (
        ecc: typeof tinysecp,
    ) => {
        fromSeed(seed: Uint8Array): BIP32Interface;
    };
};

export interface Bip44PathOptions {
    coinType: number;
    account?: number;
    change?: number;
    index?: number;
}

export default class KeyDerivationService {
    public static buildBip44Path({
        coinType = ASI_COIN_TYPE,
        account = 0,
        change = 0,
        index = 0,
    }: Bip44PathOptions): string {
        return `m/44'/${coinType}'/${account}'/${change}/${index}`;
    }

    public static derivePrivateKey(
        masterNode: BIP32Interface,
        path: string,
    ): Uint8Array {
        const node: BIP32Interface = masterNode.derivePath(path);

        if (!node.privateKey) {
            throw new Error("No private key at derived node");
        }

        return new Uint8Array(node.privateKey);
    }

    public static async mnemonicToSeed(
        mnemonicWords: string[] | string,
        passphrase = "",
    ): Promise<Uint8Array> {
        if (typeof mnemonicWords === "string") {
            return await mnemonicToSeed(mnemonicWords, passphrase);
        }

        return await mnemonicToSeed(
            MnemonicService.wordArrayToMnemonic(mnemonicWords),
            passphrase,
        );
    }

    public static seedToMasterNode(seed: any): BIP32Interface {
        return BIP32Factory(tinysecp).fromSeed(seed);
    }

    public static async deriveKeyFromMnemonic(
        mnemonicWords: string[],
        options: Bip44PathOptions = DEFAULT_BIP_44_PATH_OPTIONS,
    ): Promise<Uint8Array> {
        const bip44Path: string = this.buildBip44Path(options);

        const seed: Uint8Array =
            await KeyDerivationService.mnemonicToSeed(mnemonicWords);

        const masterNode: BIP32Interface =
            KeyDerivationService.seedToMasterNode(seed);

        return KeyDerivationService.derivePrivateKey(masterNode, bip44Path);
    }

    public static async deriveNextKeyFromMnemonic(
        mnemonicWords: string[],
        currentIndex: number,
        options: Omit<Bip44PathOptions, "index"> = DEFAULT_BIP_44_PATH_OPTIONS,
    ): Promise<Uint8Array> {
        const nextIndex: number = currentIndex + 1;

        return await this.deriveKeyFromMnemonic(mnemonicWords, {
            ...options,
            index: nextIndex,
        });
    }
}
