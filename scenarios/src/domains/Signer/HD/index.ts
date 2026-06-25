import CryptoService from "../../../services/Crypto";
import KeysManager from "../../../services/KeysManager";
import KeyDerivationService from "../../../services/KeyDerivation";
import Signer, { ISignedMessageResponse, THDSigningContext } from "..";
import { sign } from "@noble/secp256k1";

export default class HDSigner extends Signer {
    public async sign(
        payload: string,
        signingContext: THDSigningContext,
    ): Promise<ISignedMessageResponse> {
        const keyMaterial: string = await CryptoService.decryptWithPassword(
            this.encryptedSecret,
            await signingContext.passwordProvider.getSecret(),
        );

        const privateKey: Uint8Array =
            await KeyDerivationService.deriveKeyFromMnemonic(
                keyMaterial,
                signingContext.bip44path,
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
