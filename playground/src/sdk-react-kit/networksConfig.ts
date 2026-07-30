import { NetworkName, NodeApiProfile, TNetworksConfig } from "asi-wallet-sdk";

const env = import.meta.env;

export const NETWORKS_CONFIG: TNetworksConfig = {
    DevNet: {
        ValidatorURL: env.VITE_DEVNET_VALIDATOR_URL ?? "",
        ReadOnlyURL: env.VITE_DEVNET_READONLY_URL ?? "",
        IndexerURL: env.VITE_DEVNET_INDEXER_URL ?? "",
        nodeApiProfile: env.VITE_DEVNET_NODE_API_PROFILE as NodeApiProfile,
    },
    Dev: {
        ValidatorURL: env.VITE_DEV_VALIDATOR_URL ?? "",
        ReadOnlyURL: env.VITE_DEV_READONLY_URL ?? "",
        IndexerURL: env.VITE_DEV_INDEXER_URL ?? "",
        nodeApiProfile: env.VITE_DEV_NODE_API_PROFILE as NodeApiProfile,
    },
    MainNet: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: env.VITE_MAINNET_NODE_API_PROFILE as NodeApiProfile,
    },
    TestNet: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: env.VITE_TESTNET_NODE_API_PROFILE as NodeApiProfile,
    },
};

export const DEFAULT_NETWORK: NetworkName =
    (env.VITE_DEFAULT_NETWORK as NetworkName) ?? "DevNet";