import { NodeApiProfile } from "@domains/NodeApiProfile";
import type { IApiClients } from "@domains/ApiClientManager";
import type NodeApiAdapter from "@domains/NodeApiAdapter";

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

export type TNetworkBusyListener = (
    networkId: NetworkId,
    isBusy: boolean,
) => void;

export interface INetworkContext {
    networkId: NetworkId;
    name: NetworkName;
    config: INetworkConfig;
    clients: IApiClients;
    api: NodeApiAdapter;
}

const NETWORK_URL_FIELD_MAP: Record<keyof INetworkEndpoints, true> = {
    ValidatorURL: true,
    ReadOnlyURL: true,
    IndexerURL: true,
};

export const NETWORK_URL_FIELDS: (keyof INetworkEndpoints)[] = Object.keys(
    NETWORK_URL_FIELD_MAP,
) as (keyof INetworkEndpoints)[];

export const NETWORK_CONFIG_FIELDS: (keyof INetworkConfig)[] = [
    ...NETWORK_URL_FIELDS,
    "nodeApiProfile",
];
