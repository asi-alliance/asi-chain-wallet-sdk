import { NodeApiProfile } from "@domains/NodeApiProfile";

export type NetworkId = string;

export type NetworkName = string;

export interface INetworkEndpoints {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
}

export interface INetworkConfig extends INetworkEndpoints {
    nodeApiProfile: NodeApiProfile;
}

export type TNetworksConfig = Record<NetworkName, INetworkConfig>;

export interface INetworkRecord {
    id: NetworkId;
    name: NetworkName;
    config: INetworkConfig;
    isDefault: boolean;
}

export interface IPersistedNetworkRecord {
    id: NetworkId;
    name: NetworkName;
    config: INetworkConfig;
}

export interface INetworkUpdate {
    name?: NetworkName;
    config?: Partial<INetworkConfig>;
}

const NETWORK_URL_FIELD_MAP: Record<keyof INetworkEndpoints, true> = {
    ValidatorURL: true,
    ReadOnlyURL: true,
    IndexerURL: true,
};

export const NETWORK_URL_FIELDS: (keyof INetworkEndpoints)[] = Object.keys(
    NETWORK_URL_FIELD_MAP,
) as (keyof INetworkEndpoints)[];
