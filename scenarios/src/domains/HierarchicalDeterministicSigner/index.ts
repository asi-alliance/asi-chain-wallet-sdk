import Signer, {
    IHierarchicalDeterministicSignMessagePayload,
    ISignMessageResponse,
} from "../Signer";
import CryptoService from "@services/Crypto";
import KeysManager from "@services/KeysManager";
import { stringifyPrivateKeyToUnitArray } from "@utils/functions";
import { TPasswordProvider } from "@domains/PasswordProvider";
import { sign } from "@noble/secp256k1";

export default class HierarchicalDeterministicSigner extends Signer {
    private async derivePrivateKey(
        passwordProvider: TPasswordProvider,
        derivationPath: string,
    ): Promise<Uint8Array> {
        const { password } = await passwordProvider();

        try {
            const stringifyKeyData = await CryptoService.decryptWithPassword(
                this.encryptedSecret,
                password,
            );

            const seed: Uint8Array =
                stringifyPrivateKeyToUnitArray(stringifyKeyData);

            const { privateKey } = await KeysManager.getPrivateDataFromSeed(
                seed,
                {
                    customHDPath: derivationPath,
                },
            );

            return privateKey;
        } catch (error: any) {
            throw new Error("Derive Private Key Failed: " + error?.message);
        }
    }

    public async signMessage({
        passwordProvider,
        message,
        derivationPath,
    }: IHierarchicalDeterministicSignMessagePayload): Promise<ISignMessageResponse> {
        const privateKey = await this.derivePrivateKey(
            passwordProvider,
            derivationPath,
        );
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
