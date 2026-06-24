import Signer, {
    IPrivateKeySignMessagePayload,
    ISignMessageResponse,
} from "../Signer";
import CryptoService from "@services/Crypto";
import KeysManager from "@services/KeysManager";
import { stringifyPrivateKeyToUnitArray } from "@utils/functions";
import { TPasswordProvider } from "@domains/PasswordProvider";
import { sign } from "@noble/secp256k1";

export default class PrivateKeySigner extends Signer {
    private async getPrivateKey(
        passwordProvider: TPasswordProvider,
    ): Promise<Uint8Array> {
        const { password } = await passwordProvider();

        try {
            const stringifyKeyData = await CryptoService.decryptWithPassword(
                this.encryptedSecret,
                password,
            );

            return stringifyPrivateKeyToUnitArray(stringifyKeyData);
        } catch (error: any) {
            throw new Error("Get Private Key Failed: " + error?.message);
        }
    }

    public async signMessage({
        passwordProvider,
        message,
    }: IPrivateKeySignMessagePayload): Promise<ISignMessageResponse> {
        const privateKey = await this.getPrivateKey(passwordProvider);
        const publicKey = KeysManager.getPublicKeyFromPrivateKey(privateKey);

        try {
            const messageResult = await sign(message, privateKey);

            return {
                messageResult,
                publicKey,
            };
        } finally {
            privateKey.fill(0);
        }
    }
}
