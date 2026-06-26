import CryptoService from "../../../services/Crypto";
import KeysManager from "../../../services/KeysManager";
import Signer, { ISignedMessageResponse, TSigningContext } from "..";
import { toUint8Array } from "../../../utils/functions";
import { sign } from "@noble/secp256k1";
import SecretsProvider, {
    IPasswordCredentials,
    IPrivateKeyCredentials,
} from "../../SecretsProvider";

export default class PrivateKeySigner extends Signer {
    public async decrypt(
        passwordProvider: SecretsProvider<IPasswordCredentials>,
    ): Promise<IPrivateKeyCredentials> {
        const stringifiedKeyMaterial = await CryptoService.decryptWithPassword(
            this.encryptedSecret,
            passwordProvider.getSecret().password,
        );
        const keyMaterial: IPrivateKeyCredentials = JSON.parse(
            stringifiedKeyMaterial,
        );

        const privateKey: Uint8Array = toUint8Array(keyMaterial.privateKey);

        return {
            privateKey,
        };
    }

    public async sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse> {
        const { privateKey } = await this.decrypt(
            signingContext.passwordProvider,
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
