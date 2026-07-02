import Bip44Path from "@domains/Bip44Path";

export interface IPasswordCredentials {
    password: string;
}

export interface IPrivateKeyCredentials {
    privateKey: Uint8Array;
}

export interface ISeedCredentials {
    seed: string;
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

export type TSecretsProviderInterface = () => any;

export default class SecretsProvider {
    #providerInterface: TSecretsProviderInterface;

    constructor(providerInterface: TSecretsProviderInterface) {
        this.#providerInterface = providerInterface;
    }

    public getSecret(): any {
        return this.#providerInterface();
    }
}
