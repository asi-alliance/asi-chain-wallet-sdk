export interface IPasswordData {
    password: string;
}

export interface IFullPasswordData extends IPasswordData {
    privateKey: Uint8Array;
}

export type TPasswordProvider = () => Promise<IPasswordData>;
export type TPasswordProviderWithPrivateKey = () => Promise<IFullPasswordData>;
