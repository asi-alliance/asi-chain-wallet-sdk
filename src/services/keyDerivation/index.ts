import * as bip39 from "bip39";
import * as bip32 from "bip32";
import * as tinysecp from "tiny-secp256k1";

export default class KeyDerivationService {
    public static buildBip44Path(
        coinType: number,
        account = 0,
        change = 0,
        index = 0
    ): string {
        return `m/44'/${coinType}'/${account}'/${change}/${index}`;
    }

    public static derivePrivateKey(
        masterNode: bip32.BIP32Interface,
        path: string
    ): string {
        const node = masterNode.derivePath(path);

        if (!node.privateKey) {
            throw new Error("No private key at derived node")
        };

        return node.privateKey.toString("hex");
    }

    public static mnemonicToSeed(
        mnemonic: string,
        passphrase = ""
    ): Promise<Uint8Array> {
        return bip39.mnemonicToSeed(mnemonic, passphrase);
    }

    public static seedToMasterNode(seed: any): bip32.BIP32Interface {
        return bip32.default(tinysecp).fromSeed(seed);
    }
}
