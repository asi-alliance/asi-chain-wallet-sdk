import "dotenv/config";

import { NodeApiProfile } from "@domains/NodeApiProfile";
import { INetworkConfig, NetworkName, TNetworksConfig } from "@domains/Network";

const hasFilledEndpoints = (config: INetworkConfig): boolean =>
    Boolean(config.ValidatorURL && config.ReadOnlyURL && config.IndexerURL);

const parseNetworksFromEnv = (): TNetworksConfig => {
    const rawNetworks: string | undefined = process.env.VITE_NETWORKS;

    if (!rawNetworks) {
        throw new Error(
            "VITE_NETWORKS is not defined. Network flow tests read their networks from the root .env file.",
        );
    }

    return JSON.parse(rawNetworks) as TNetworksConfig;
};

const findNetworkByProfile = (
    networks: TNetworksConfig,
    profile: NodeApiProfile,
): [NetworkName, INetworkConfig] => {
    const entry: [NetworkName, INetworkConfig] | undefined = Object.entries(
        networks,
    ).find(
        ([, config]: [NetworkName, INetworkConfig]) =>
            config.nodeApiProfile === profile && hasFilledEndpoints(config),
    );

    if (!entry) {
        throw new Error(
            `VITE_NETWORKS has no network with the "${profile}" profile and filled endpoints.`,
        );
    }

    return entry;
};

const ENV_NETWORKS: TNetworksConfig = parseNetworksFromEnv();

const [scalaName, scalaConfig] = findNetworkByProfile(
    ENV_NETWORKS,
    NodeApiProfile.SCALA,
);

console.log("SCALA: ", scalaConfig);

const [rustName, rustConfig] = findNetworkByProfile(
    ENV_NETWORKS,
    NodeApiProfile.RUST,
);

console.log("RUST: ", rustConfig);

export const SCALA_NETWORK: NetworkName = scalaName;
export const RUST_NETWORK: NetworkName = rustName;

export const NETWORKS_CONFIG: TNetworksConfig = {
    [scalaName]: scalaConfig,
    [rustName]: rustConfig,
};

export const CUSTOM_NETWORK_CONFIG: INetworkConfig = {
    ...rustConfig,
    nodeApiProfile: NodeApiProfile.RUST,
};
