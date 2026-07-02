export type NetworkName = "Dev" | "MainNet" | "TestNet" | "DevNet";

export interface INetworkConfig {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
}

export type TNetworksConfig = Record<NetworkName, INetworkConfig>;
