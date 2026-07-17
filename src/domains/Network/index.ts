export type NetworkName = string;

export interface INetworkConfig {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
}

export type TNetworksConfig = Record<NetworkName, INetworkConfig>;

export interface INetworkRecord {
    config: INetworkConfig;
    isDefault: boolean;
}
