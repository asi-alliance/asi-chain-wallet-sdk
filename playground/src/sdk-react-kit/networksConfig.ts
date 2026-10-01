import { NetworkName, TNetworksConfig } from "asi-wallet-sdk";
import { toNodeApiProfile } from "./validators";

const env = import.meta.env;

export const NETWORKS_CONFIG: TNetworksConfig = {
    DevNet: {
        ValidatorURL: env.VITE_DEVNET_VALIDATOR_URL ?? "",
        ReadOnlyURL: env.VITE_DEVNET_READONLY_URL ?? "",
        IndexerURL: env.VITE_DEVNET_INDEXER_URL ?? "",
        nodeApiProfile: toNodeApiProfile(env.VITE_DEVNET_NODE_API_PROFILE),
    },
    Dev: {
        ValidatorURL: env.VITE_DEV_VALIDATOR_URL ?? "",
        ReadOnlyURL: env.VITE_DEV_READONLY_URL ?? "",
        IndexerURL: env.VITE_DEV_INDEXER_URL ?? "",
        nodeApiProfile: toNodeApiProfile(env.VITE_DEV_NODE_API_PROFILE),
    },
    AlexanderNet: {
        ValidatorURL: env.VITE_ALEXANDERNET_VALIDATOR_URL ?? "",
        ReadOnlyURL: env.VITE_ALEXANDERNET_READONLY_URL ?? "",
        IndexerURL: env.VITE_ALEXANDERNET_INDEXER_URL ?? "",
        nodeApiProfile: toNodeApiProfile(
            env.VITE_ALEXANDERNET_NODE_API_PROFILE,
        ),
    },
    MainNet: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: toNodeApiProfile(env.VITE_MAINNET_NODE_API_PROFILE),
    },
    TestNet: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: toNodeApiProfile(env.VITE_TESTNET_NODE_API_PROFILE),
    },
};

export const DEFAULT_NETWORK: NetworkName =
    (env.VITE_DEFAULT_NETWORK as NetworkName) ?? "DevNet";
