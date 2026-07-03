import Bip44Path from "@domains/Bip44Path";
import CryptoService from "@services/Crypto";
import KeysManager from "@services/KeysManager";
import KeyDerivationService from "@services/KeyDerivation";
import Signer, {
    ISignedMessageResponse,
    THDSigningContext,
} from "@domains/Signer";
import { sign } from "@noble/secp256k1";
import { IHDSecretRecord } from "@domains/SecretsProvider";

export default class HDSigner extends Signer {
    public async sign(
        payload: string,
        signingContext: THDSigningContext,
    ): Promise<ISignedMessageResponse> {
        const stringifiedKeyMaterial: string =
            await CryptoService.decryptWithPassword(
                this.encryptedSecret,
                signingContext.passwordProvider.getSecret().password,
            );
        const keyMaterial: IHDSecretRecord = JSON.parse(stringifiedKeyMaterial);

        const path: Bip44Path = Bip44Path.parse(keyMaterial.rootHDPath);

        path.setIndex(signingContext.index);

        const privateKey = await KeyDerivationService.deriveKeyFromMnemonic(
            keyMaterial.seed,
            path,
        );

        const publicKey: Uint8Array =
            KeysManager.getPublicKeyFromPrivateKey(privateKey);

        try {
            const messageResult: Uint8Array = await sign(payload, privateKey);

            return {
                signature: messageResult,
                publicKey,
            };
        } finally {
            privateKey.fill(0);
        }
    }
}
