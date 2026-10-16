import { sha256 } from "@noble/hashes/sha2";
import type { BIP32Interface } from "bip32";
import Bip44Path from "@domains/Bip44Path";
import type {
    IHDSecret,
    IHDSecretRecord,
    IPrivateKeyCredentials,
} from "@domains/SecretsProvider";
import KeysManager from "@services/KeysManager";
import KeyDerivationService from "@services/KeyDerivation";
import MnemonicService from "@services/Mnemonic";
import { encodeBase16 } from "@utils/codec";

export type TFingerprintSecret =
    | IPrivateKeyCredentials
    | IHDSecret
    | IHDSecretRecord;

export default class KeyFingerprintService {
    public static fromPublicKey(publicKey: Uint8Array): string {
        return encodeBase16(sha256(publicKey));
    }

    public static fromPrivateKey(privateKey: Uint8Array): string {
        return this.fromPublicKey(
            KeysManager.getPublicKeyFromPrivateKey(privateKey),
        );
    }

    private static fromNode(node: BIP32Interface): string {
        return encodeBase16(
            sha256.create().update(node.publicKey).update(node.chainCode).digest(),
        );
    }

    private static async getMasterNode(
        mnemonic: string,
    ): Promise<BIP32Interface> {
        const seed: Uint8Array = await MnemonicService.mnemonicToSeed(mnemonic);

        try {
            return KeyDerivationService.seedToMasterNode(seed);
        } finally {
            seed.fill(0);
        }
    }

    // TODO(next-major): Remove together with the legacy HD fingerprint lookup;
    // this formula ignores the root HD path and is kept only to match signer
    // records persisted before fromHDSecret was introduced.
    public static async fromMnemonic(mnemonic: string): Promise<string> {
        return this.fromNode(await this.getMasterNode(mnemonic));
    }

    public static async fromHDSecret(
        mnemonic: string,
        rootHDPath: string | Bip44Path,
    ): Promise<string> {
        const masterNode: BIP32Interface = await this.getMasterNode(mnemonic);

        return this.fromNode(
            masterNode.derivePath(
                Bip44Path.parse(rootHDPath.toString()).toRootPathString(),
            ),
        );
    }

    public static fromSecret(secret: TFingerprintSecret): Promise<string> {
        if ("privateKey" in secret) {
            return Promise.resolve(this.fromPrivateKey(secret.privateKey));
        }

        return this.fromHDSecret(secret.seed, secret.rootHDPath);
    }
}
