export enum NetworkType {
    DEV = "Dev",
    DEVNET = "DevNet",
}

export interface NetworkConfig {
    name: NetworkType;
    ValidatorURL: string;
    ReadOnlyURL: string;
}

export type NetworksConfig = Record<NetworkType, NetworkConfig>;

export const isValidNetworkType = (value: unknown): value is NetworkType => {
    return Object.values(NetworkType).includes(value as NetworkType);
};

export const getNetworkKey = (network: NetworkType): string => {
    return `SELECTED_NETWORK_${network}`;
};
