import Signer, {
    ISignedMessageResponse,
    TSigningContext,
} from "@domains/Signer";
import KeysManager from "@services/KeysManager";
import { IPrivateKeyCredentials } from "@domains/SecretsProvider";
import { sign } from "@noble/secp256k1";

export default class PrivateKeySigner extends Signer {
    public async sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse> {
        const { secret, ephemeral } =
            await this.resolveSecret(signingContext);

        const { privateKey } = secret as IPrivateKeyCredentials;

        const publicKey: Uint8Array =
            KeysManager.getPublicKeyFromPrivateKey(privateKey);

        try {
            const messageResult: Uint8Array = await sign(payload, privateKey);

            return {
                signature: messageResult,
                publicKey,
            };
        } finally {
            if (ephemeral) {
                privateKey.fill(0);
            }
        }
    }
}
