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

export {
    DEFAULT_DECIMALS_AMOUNT,
    DEFAULT_AXIOS_TIMEOUT_MS,
    MAX_WALLETS_PER_ACCOUNT,
};
