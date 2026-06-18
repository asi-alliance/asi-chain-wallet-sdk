export interface IPasswordCredentials {
    password: string;
}

export interface IPrivateKeyCredentials {
    privateKey: Uint8Array;
}

export interface ISeedCredentials {
    seed: Uint8Array;
}

export interface IPrivateKeyWithCredentials extends IPasswordCredentials {
    privateKey: Uint8Array;
}

export type TPasswordProvider = () => Promise<IPasswordCredentials>;
export type TPrivateKeyPasswordProvider =
    () => Promise<IPrivateKeyWithCredentials>;

export type TPrivateKeyProvider = () => Promise<IPrivateKeyCredentials>;
export type TSeedProvider = () => Promise<ISeedCredentials>;
