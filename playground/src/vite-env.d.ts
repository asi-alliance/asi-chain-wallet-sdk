/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_DEFAULT_NETWORK?: string;
    readonly VITE_DEVNET_VALIDATOR_URL?: string;
    readonly VITE_DEVNET_READONLY_URL?: string;
    readonly VITE_DEVNET_INDEXER_URL?: string;
    readonly VITE_DEVNET_NODE_API_PROFILE?: string;
    readonly VITE_DEV_VALIDATOR_URL?: string;
    readonly VITE_DEV_READONLY_URL?: string;
    readonly VITE_DEV_INDEXER_URL?: string;
    readonly VITE_DEV_NODE_API_PROFILE?: string;
    readonly VITE_ALEXANDERNET_VALIDATOR_URL?: string;
    readonly VITE_ALEXANDERNET_READONLY_URL?: string;
    readonly VITE_ALEXANDERNET_INDEXER_URL?: string;
    readonly VITE_ALEXANDERNET_NODE_API_PROFILE?: string;
    readonly VITE_MAINNET_NODE_API_PROFILE?: string;
    readonly VITE_TESTNET_NODE_API_PROFILE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}