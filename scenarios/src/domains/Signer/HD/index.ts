import CryptoService from "../../../services/Crypto";
import KeysManager from "../../../services/KeysManager";
import Signer, { ISignedMessageResponse, THDSigningContext } from "..";
import { sign } from "@noble/secp256k1";
import { toUint8Array } from "../../../utils";
import SecretsProvider, {
    IHDSecret,
    IHDSecretRecord,
    IPasswordCredentials,
} from "../../SecretsProvider";
import Bip44Path from "../../Bip44Path";

export default class HDSigner extends Signer {
    public async decrypt(
        passwordProvider: SecretsProvider<IPasswordCredentials>,
    ): Promise<IHDSecret> {
        const stringifiedKeyMaterial: string =
            await CryptoService.decryptWithPassword(
                this.encryptedSecret,
                passwordProvider.getSecret().password,
            );
        const keyMaterial: IHDSecretRecord = JSON.parse(stringifiedKeyMaterial);

        const seed: Uint8Array = toUint8Array(keyMaterial.seed);
        const path: Bip44Path = Bip44Path.parse(keyMaterial.rootHDPath);

        return {
            seed,
            rootHDPath: path,
        };
    }

    public async sign(
        payload: string,
        signingContext: THDSigningContext,
    ): Promise<ISignedMessageResponse> {
        const keyMaterial: string = await CryptoService.decryptWithPassword(
            this.encryptedSecret,
            signingContext.passwordProvider.getSecret().password,
        );
        const seed: Uint8Array = toUint8Array(keyMaterial);
        const path: Bip44Path =
            signingContext.bip44path instanceof Bip44Path
                ? signingContext.bip44path
                : Bip44Path.parse(signingContext.bip44path);

        const { privateKey } = await KeysManager.getPrivateDataFromSeed(seed, {
            customHDPath: path,
        });

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
