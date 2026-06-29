import CryptoService from "../../../services/Crypto";
import KeysManager from "../../../services/KeysManager";
import Signer, { ISignedMessageResponse, TSigningContext } from "..";
import { decryptSignerData, toUint8Array } from "../../../utils/functions";
import { sign } from "@noble/secp256k1";
import SecretsProvider, { IPrivateKeyCredentials } from "../../SecretsProvider";

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
