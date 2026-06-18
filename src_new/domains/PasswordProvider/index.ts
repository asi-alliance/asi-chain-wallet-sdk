export interface IPasswordCredentials {
    password: string;
}

export interface IPrivateKeyCredentials extends IPasswordCredentials {
    privateKey: Uint8Array;
}

export type TPasswordProvider = () => Promise<IPasswordCredentials>;
export type TPrivateKeyPasswordProvider = () => Promise<IPrivateKeyCredentials>;
