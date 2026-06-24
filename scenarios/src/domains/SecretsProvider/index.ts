export type TSecretsProviderPayload = any;
export type TSecretsProviderInterface = () => TSecretsProviderPayload;

export default class SecretsProvider {
    #providerInterface: TSecretsProviderInterface;

    constructor(providerInterface: TSecretsProviderInterface) {
        this.#providerInterface = providerInterface;
    }

    public getSecret(): TSecretsProviderPayload {
        return this.#providerInterface();
    }
}
