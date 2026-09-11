import ECC from "./eccAdapter";
import MnemonicService from "@services/Mnemonic";
import Bip44Path, { IBip44PathOptions } from "@domains/Bip44Path";
import { setupBufferPolyfill } from "@utils/polyfills";
import { BIP32Factory, type BIP32Interface } from "bip32";
import { mnemonicToSeed } from "bip39";
import { DEFAULT_BIP_44_PATH_OPTIONS } from "@utils/index";

setupBufferPolyfill();

export default class KeyDerivationService {
    public static async deriveKeyFromMnemonic(
        mnemonic: string | string[],
        bip44path: string | Bip44Path,
    ): Promise<Uint8Array> {
        const pathString: string =
            typeof bip44path === "string" ? bip44path : bip44path.toString();

        const seed: Uint8Array = await MnemonicService.mnemonicToSeed(mnemonic);

        const masterNode: BIP32Interface = BIP32Factory(ECC).fromSeed(
            Buffer.from(seed),
        );

        seed.fill(0);

        const node: BIP32Interface = masterNode.derivePath(pathString);

        if (!node.privateKey) {
            throw new Error("No private key at derived node");
        }

        return new Uint8Array(node.privateKey);
    }

    public static derivePrivateKey(
        masterNode: BIP32Interface,
        path: Bip44Path,
    ): Uint8Array {
        const node: BIP32Interface = masterNode.derivePath(path.toString());

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
        return BIP32Factory(ECC).fromSeed(Buffer.from(seed));
    }

    public static compareIndexes(
        firstIndex: number | null,
        secondIndex: number | null,
    ): number {
        if (firstIndex === null && secondIndex === null) {
            return 0;
        }

        if (firstIndex === null) {
            return 1;
        }

        if (secondIndex === null) {
            return -1;
        }

        return firstIndex - secondIndex;
    }

    public static async deriveNextKeyFromMnemonic(
        mnemonicWords: string[],
        currentIndex: number,
        options: Omit<IBip44PathOptions, "index"> = DEFAULT_BIP_44_PATH_OPTIONS,
    ): Promise<Uint8Array> {
        const nextIndex: number = currentIndex + 1;
        const path = new Bip44Path({
            ...options,
            index: nextIndex,
        });

        return await this.deriveKeyFromMnemonic(mnemonicWords, path);
    }
}
