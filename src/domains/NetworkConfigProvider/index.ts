import { INetworkConfig, NetworkName, TNetworksConfig } from "@domains/Network";

export default class NetworkConfigProvider {
    private networksConfig: TNetworksConfig | null = null;

    public initialize(config: TNetworksConfig): void {
        this.networksConfig = config;
    }

    public get(network: NetworkName): INetworkConfig {
        if (!this.networksConfig) {
            throw new Error("Network config is not initialized");
        }

        return this.networksConfig[network];
    }

    public isReady(): boolean {
        return this.networksConfig !== null;
    }
}
