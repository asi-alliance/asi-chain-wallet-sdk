export interface IPasswordCredentials {
    password: string;
}

export interface IPrivateKeyCredentials extends IPasswordCredentials {
    privateKey: Uint8Array;
}

export interface IHDWalletCredentials extends IPrivateKeyCredentials {
    seedPassword: string;
}

export type TPasswordProvider = () => Promise<IPasswordCredentials>;
export type TPrivateKeyPasswordProvider = () => Promise<IPrivateKeyCredentials>;
export type THDWalletPasswordProvider = () => Promise<IHDWalletCredentials>;
