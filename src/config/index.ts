import { ResubmitConfig, ResubmitNode } from "../services/Resubmit/types";

export interface WalletClientConfig {
    mode: string;
    // network: string;
    // availableNetworks: Networks[];
}

export enum WalletClientModes {
    LOCAL = "local",
    MPC = "mpc",
}

export const DEFAULT_CLIENT_CONFIG: WalletClientConfig = {
    mode: WalletClientModes.LOCAL,
    // network: Networks.DEVNET,
    // availableNetworks: [Networks.MAINNET, Networks.TESTNET, Networks.DEVNET],
};

const DEFAULT_AXIOS_TIMEOUT_MS: number = 30000;
const MAX_WALLETS_PER_ACCOUNT: number = 20;
const DEFAULT_DECIMALS_AMOUNT: number = 8;
const DEFAULT_PHLO_LIMIT: number = 500000;

export const DEFAULT_RESUBMIT_CONFIG: ResubmitConfig = {
    deployValidityTime: 300,
    retries: 3,
    nodeSelectionAttempts: 3,
    deployLifeSpan: 50,
    phloPrice: 1,
    isRandomNodeUsed: true,
    pollingInterval: 5,
};


export {
    DEFAULT_DECIMALS_AMOUNT,
    DEFAULT_AXIOS_TIMEOUT_MS,
    MAX_WALLETS_PER_ACCOUNT,
    DEFAULT_PHLO_LIMIT,
};

export type { ResubmitConfig, ResubmitNode };
