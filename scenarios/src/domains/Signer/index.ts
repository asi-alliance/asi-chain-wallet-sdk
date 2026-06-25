import Bip44Path from "../Bip44Path";
import type SecretsProvider from "../SecretsProvider";
import { EncryptedData } from "../../services/Crypto";

export type TPKSigningContext = {
    passwordProvider: SecretsProvider;
};

export type THDSigningContext = {
    passwordProvider: SecretsProvider;
    bip44path: string | Bip44Path;
};

export type ISignedMessageResponse = {
    signature: Uint8Array;
    publicKey: Uint8Array;
};

export type TSigningContext = TPKSigningContext | THDSigningContext;

export default abstract class Signer {
    protected encryptedSecret: EncryptedData;

    constructor(encryptedSecret: EncryptedData) {
        this.encryptedSecret = encryptedSecret;
    }

    public getEncryptedSecret(): EncryptedData {
        return this.encryptedSecret;
    }

    public abstract sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse>;
}
