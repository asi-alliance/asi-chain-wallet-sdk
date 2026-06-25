import CryptoService from "../../../services/Crypto";
import KeysManager from "../../../services/KeysManager";
import Signer, { ISignedMessageResponse, TSigningContext } from "..";
import { toUint8Array } from "../../../utils/functions";
import { sign } from "@noble/secp256k1";

export default class PrivateKeySigner extends Signer {
    public async sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse> {
        const keyMaterial: string = await CryptoService.decryptWithPassword(
            this.encryptedSecret,
            await signingContext.passwordProvider.getSecret(),
        );

        const privateKey: Uint8Array = toUint8Array(keyMaterial);
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
