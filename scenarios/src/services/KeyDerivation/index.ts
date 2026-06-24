import ECC from "./eccAdapter";
import MnemonicService from "../Mnemonic";
import Bip44Path from "../../domains/Bip44Path";
import { setupBufferPolyfill } from "../../utils/polyfills";
import { BIP32Factory, type BIP32Interface } from "bip32";

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
}
