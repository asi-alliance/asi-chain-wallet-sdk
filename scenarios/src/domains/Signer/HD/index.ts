import CryptoService from "../../../services/Crypto";
import KeysManager from "../../../services/KeysManager";
import Signer, { ISignMessageResponse, THDSigningContext } from "..";
import { toUint8Array } from "../../../utils/functions";
import { sign } from "@noble/secp256k1";

export default class HDSigner extends Signer {
    public async sign(
        payload: string,
        signingContext: THDSigningContext,
    ): Promise<ISignMessageResponse> {
        const keyMaterial: string = await CryptoService.decryptWithPassword(
            this.encryptedSecret,
            await signingContext.passwordProvider.getSecret(),
        );

        const seed: Uint8Array = toUint8Array(keyMaterial);

        const { privateKey } = await KeysManager.getPrivateDataFromSeed(seed, {
            customHDPath: derivationPath,
        });

        return privateKey;

        const privateKey = await this.derivePrivateKey(
            signingContext.passwordProvider,
            derivationPath,
        );

        try {
            const messageResult = await sign(payload, privateKey);

            return {
                messageResult,
                publicKey,
            };
        } finally {
            privateKey.fill(0);
        }
    }
}
