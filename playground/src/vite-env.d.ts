/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_DEFAULT_NETWORK?: string;
    readonly VITE_DEVNET_VALIDATOR_URL?: string;
    readonly VITE_DEVNET_READONLY_URL?: string;
    readonly VITE_DEVNET_INDEXER_URL?: string;
    readonly VITE_DEV_VALIDATOR_URL?: string;
    readonly VITE_DEV_READONLY_URL?: string;
    readonly VITE_DEV_INDEXER_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}