import Bip44Path from "@domains/Bip44Path";
import type SecretsProvider from "@domains/SecretsProvider";
import { EncryptedData } from "@services/Crypto";
import { WalletTypes } from "@domains/Wallet";

export interface ISignerOptions {
    id: string;
    encryptedSecret: EncryptedData;
}

export type TPKSigningContext = {
    passwordProvider: SecretsProvider;
};

export type THDSigningContext = {
    passwordProvider: SecretsProvider;
    index: number;
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
    protected readonly id: string;
    protected encryptedSecret: EncryptedData;

    constructor({ id, encryptedSecret }: ISignerOptions) {
        this.id = id;
        this.encryptedSecret = encryptedSecret;
    }

    public getId(): string {
        return this.id;
    }

    public getEncryptedSecret(): EncryptedData {
        return this.encryptedSecret;
    }

    public abstract sign(
        payload: string,
        signingContext: TSigningContext,
    ): Promise<ISignedMessageResponse>;
}
