import KeysManager from "../../../services/KeysManager";
import Signer, { ISignedMessageResponse, TSigningContext } from "..";
import { IPrivateKeyCredentials } from "../../SecretsProvider";
import { decryptSignerData } from "../../../utils/functions";
import { sign } from "@noble/secp256k1";

export default class PrivateKeySigner extends Signer {
    public async sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse> {
        const { privateKey } = (await decryptSignerData(
            this.encryptedSecret,
            signingContext.passwordProvider,
        )) as IPrivateKeyCredentials;

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
