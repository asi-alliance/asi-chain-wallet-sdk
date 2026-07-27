import { NetworkName, TNetworksConfig } from "asi-wallet-sdk";

const env = import.meta.env;

export const NETWORKS_CONFIG: TNetworksConfig = {
    DevNet: {
        ValidatorURL: env.VITE_DEVNET_VALIDATOR_URL ?? "",
        ReadOnlyURL: env.VITE_DEVNET_READONLY_URL ?? "",
        IndexerURL: env.VITE_DEVNET_INDEXER_URL ?? "",
    },
    //TODO: Wait until the Dev network is stable.
    // Dev: {
    //     ValidatorURL: env.VITE_DEV_VALIDATOR_URL ?? "",
    //     ReadOnlyURL: env.VITE_DEV_READONLY_URL ?? "",
    //     IndexerURL: env.VITE_DEV_INDEXER_URL ?? "",
    // },
    MainNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
    TestNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
};

export const DEFAULT_NETWORK: NetworkName =
    (env.VITE_DEFAULT_NETWORK as NetworkName) ?? "DevNet";
