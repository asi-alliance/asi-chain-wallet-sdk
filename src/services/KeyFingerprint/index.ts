import { sha256 } from "@noble/hashes/sha2";
import type { BIP32Interface } from "bip32";
import type {
    IPrivateKeyCredentials,
    ISeedCredentials,
} from "@domains/SecretsProvider";
import KeysManager from "@services/KeysManager";
import KeyDerivationService from "@services/KeyDerivation";
import MnemonicService from "@services/Mnemonic";
import { encodeBase16 } from "@utils/codec";

export type TFingerprintSecret = IPrivateKeyCredentials | ISeedCredentials;

export default class KeyFingerprintService {
    public static fromPublicKey(publicKey: Uint8Array): string {
        return encodeBase16(sha256(publicKey));
    }

    public static fromPrivateKey(privateKey: Uint8Array): string {
        return this.fromPublicKey(
            KeysManager.getPublicKeyFromPrivateKey(privateKey),
        );
    }

    public static async fromMnemonic(mnemonic: string): Promise<string> {
        const seed: Uint8Array = await MnemonicService.mnemonicToSeed(mnemonic);

        try {
            const masterNode: BIP32Interface =
                KeyDerivationService.seedToMasterNode(seed);

            return encodeBase16(
                sha256
                    .create()
                    .update(masterNode.publicKey)
                    .update(masterNode.chainCode)
                    .digest(),
            );
        } finally {
            seed.fill(0);
        }
    }

    public static fromSecret(secret: TFingerprintSecret): Promise<string> {
        if ("privateKey" in secret) {
            return Promise.resolve(this.fromPrivateKey(secret.privateKey));
        }

        return this.fromMnemonic(secret.seed);
    }
}
