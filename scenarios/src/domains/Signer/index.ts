import Bip44Path from "../Bip44Path";
import type SecretsProvider from "../SecretsProvider";
import { EncryptedData } from "../../services/Crypto";
import { IPasswordCredentials } from "../SecretsProvider";
import { WalletTypes } from "../Wallet";

export type TPKSigningContext = {
    passwordProvider: SecretsProvider<IPasswordCredentials>;
};

export type THDSigningContext = {
    passwordProvider: SecretsProvider<IPasswordCredentials>;
    bip44path: string | Bip44Path;
};

export type ISignedMessageResponse = {
    signature: Uint8Array;
    publicKey: Uint8Array;
};

export type TSigningContext = TPKSigningContext | THDSigningContext;

export interface ISignerRecord {
    id: string;
    type: WalletTypes;
    encryptedData: EncryptedData;
}

export default abstract class Signer {
    protected encryptedSecret: EncryptedData;

    constructor(encryptedSecret: EncryptedData) {
        this.encryptedSecret = encryptedSecret;
    }

    public getEncryptedSecret(): EncryptedData {
        return this.encryptedSecret;
    }

    public abstract decrypt(
        passwordProvider: SecretsProvider<IPasswordCredentials>,
    ): Promise<any>;

    public abstract sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse>;
}
