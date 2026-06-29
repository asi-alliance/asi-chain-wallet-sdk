import CryptoService from "../../../services/Crypto";
import KeysManager from "../../../services/KeysManager";
import Signer, { ISignedMessageResponse, THDSigningContext } from "..";
import { sign } from "@noble/secp256k1";
import SecretsProvider, {
    IHDSecret,
    IHDSecretRecord,
} from "../../SecretsProvider";
import Bip44Path from "../../Bip44Path";
import KeyDerivationService from "../../../services/KeyDerivation";

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

        const path: Bip44Path =
            signingContext.bip44path instanceof Bip44Path
                ? signingContext.bip44path
                : Bip44Path.parse(signingContext.bip44path);

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
