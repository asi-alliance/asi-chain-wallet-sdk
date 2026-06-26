import Bip44Path from "../Bip44Path";

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

export interface IHDSecret extends ISeedCredentials {
    rootHDPath: Bip44Path;
}

export interface IHDSecretRecord extends ISeedCredentials {
    rootHDPath: string;
}

export interface IAccountHDData extends ISeedCredentials {
    path: string;
}

export interface ICreateHDWalletPayload extends ISeedCredentials {
    customHDPath?: string;
}

export type TSecretsProviderInterface<T> = () => T;

export default class SecretsProvider<T> {
    #providerInterface: TSecretsProviderInterface<T>;

    constructor(providerInterface: TSecretsProviderInterface<T>) {
        this.#providerInterface = providerInterface;
    }

    public getSecret(): T {
        return this.#providerInterface();
    }
}
