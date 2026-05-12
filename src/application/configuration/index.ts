import { NetworkName } from "@domain/";

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

export type ClientConfiguration = {
    currentNetworkName: NetworkName;
}

export const defaultClientConfiguration: ClientConfiguration = {
    currentNetworkName: "DevNet",
}