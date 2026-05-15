import { BIP32Factory, type BIP32Interface } from "bip32";
import { mnemonicToSeed } from "bip39";
import { Buffer } from "buffer";
import type { IKeyDerivation } from "@/application/ports/outbound/IKeyDerivation";
import {
    Bip44Path,
    type Bip44PathOptions,
} from "@/domain/valueObjects/KeyDerivation";
import { DEFAULT_BIP_44_PATH_OPTIONS } from "@/domain/constants";
import { setupBufferPolyfill } from "../../misc/polyfills";
import ECC from "./eccAdapter";

setupBufferPolyfill();

export class Bip32KeyDerivationAdapter implements IKeyDerivation {
    public static buildBip44Path(
        options: Bip44PathOptions = DEFAULT_BIP_44_PATH_OPTIONS,
    ): string {
        return Bip44Path.build(options);
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
        return await mnemonicToSeed(
            Bip32KeyDerivationAdapter.normalizeMnemonic(mnemonicWords),
            passphrase,
        );
    }

    public static seedToMasterNode(seed: Uint8Array): BIP32Interface {
        return BIP32Factory(ECC).fromSeed(Buffer.from(seed));
    }

    public static async deriveKeyFromMnemonic(
        mnemonicWords: string[] | string,
        options: Bip44PathOptions = DEFAULT_BIP_44_PATH_OPTIONS,
        passphrase = "",
    ): Promise<Uint8Array> {
        const bip44Path: string =
            Bip32KeyDerivationAdapter.buildBip44Path(options);

        const seed: Uint8Array =
            await Bip32KeyDerivationAdapter.mnemonicToSeed(
                mnemonicWords,
                passphrase,
            );

        const masterNode: BIP32Interface =
            Bip32KeyDerivationAdapter.seedToMasterNode(seed);

        return Bip32KeyDerivationAdapter.derivePrivateKey(masterNode, bip44Path);
    }

    public static async deriveNextKeyFromMnemonic(
        mnemonicWords: string[] | string,
        currentIndex: number,
        options: Omit<Bip44PathOptions, "index"> = DEFAULT_BIP_44_PATH_OPTIONS,
        passphrase = "",
    ): Promise<Uint8Array> {
        const nextIndex: number = currentIndex + 1;

        return await Bip32KeyDerivationAdapter.deriveKeyFromMnemonic(
            mnemonicWords,
            {
                ...options,
                index: nextIndex,
            },
            passphrase,
        );
    }

    public async derivePrivateKeyFromMnemonic(
        mnemonicWords: string[] | string,
        options: Bip44PathOptions = DEFAULT_BIP_44_PATH_OPTIONS,
        passphrase = "",
    ): Promise<Uint8Array> {
        return await Bip32KeyDerivationAdapter.deriveKeyFromMnemonic(
            mnemonicWords,
            options,
            passphrase,
        );
    }

    public async deriveNextPrivateKeyFromMnemonic(
        mnemonicWords: string[] | string,
        currentIndex: number,
        options: Omit<Bip44PathOptions, "index"> = DEFAULT_BIP_44_PATH_OPTIONS,
        passphrase = "",
    ): Promise<Uint8Array> {
        return await Bip32KeyDerivationAdapter.deriveNextKeyFromMnemonic(
            mnemonicWords,
            currentIndex,
            options,
            passphrase,
        );
    }

    private static normalizeMnemonic(mnemonicWords: string[] | string): string {
        if (typeof mnemonicWords === "string") {
            return mnemonicWords;
        }

        return mnemonicWords.join(" ");
    }
}

export default Bip32KeyDerivationAdapter;
