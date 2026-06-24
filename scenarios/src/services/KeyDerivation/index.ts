import ECC from "./eccAdapter";
import MnemonicService from "../Mnemonic";
import { ASI_COIN_TYPE, DEFAULT_BIP_44_PATH_OPTIONS } from "../../utils/constants";
import { setupBufferPolyfill } from "../../utils/polyfills";
import { BIP32Factory, type BIP32Interface } from "bip32";

setupBufferPolyfill();

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

    public static seedToMasterNode(seed: any): BIP32Interface {
        return BIP32Factory(ECC).fromSeed(Buffer.from(seed));
    }

    public static replaceBip44Index(path: string, index: number): string {
        const parts = path.split("/");

        parts[parts.length - 1] = String(index);

        return parts.join("/");
    }

    public static async deriveKeyFromMnemonic(
        mnemonicWords: string[],
        options: Bip44PathOptions = DEFAULT_BIP_44_PATH_OPTIONS,
    ): Promise<Uint8Array> {
        const bip44Path: string = this.buildBip44Path(options);

        const seed: Uint8Array =
            await MnemonicService.mnemonicToSeed(mnemonicWords);

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
