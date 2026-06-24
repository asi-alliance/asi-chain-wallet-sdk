import { EncryptedSecretMaterial, SignerRecord } from "./Persistence";

export type SignerType = "hd" | "private-key" | "mpc";

export interface SignerFactoryOptions {
    readonly type: SignerType;
    readonly id?: string;
    readonly name: string;
    readonly secretMaterial: Uint8Array;
    readonly password: string;
}

export interface SignerRestoreOptions {
    readonly record: SignerRecord;
    readonly password: string;
}

export interface SignContext {
    readonly accountId?: string;
    readonly networkId?: string;
    readonly derivationPath?: string;
}

export interface ISigner {
    readonly id: string;
    readonly type: SignerType;
    readonly name: string;

    sign(payload: Uint8Array, password: string, context?: SignContext): Promise<Uint8Array>;
    getEncryptedSecret(): EncryptedSecretMaterial;
}

export interface IHDSigner extends ISigner {
    derive(derivationPath: string, password: string): Promise<Uint8Array>;
}

export interface IPKSigner extends ISigner {}

export interface IMPCSigner extends ISigner {}

export interface SignerMeta {
    readonly id: string;
    readonly type: SignerType;
    readonly name: string;
    readonly createdAt: number;
    readonly updatedAt?: number;
}
