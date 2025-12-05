export type Network = "DEVNET" | "TESTNET"

export type ClientMode = "LOCAL" | "MPC";

export interface WalletMeta {
  id: string;
  network: Network;
  mode: ClientMode;
  label?: string;
}

export interface AddressInfo {
  walletId: string;
  index: number;
  address: string;
}

export interface AssetMeta {
  id: string;
  symbol: string;
  name?: string;
  decimals: number;
}

export interface Balance {
  address: string;
  assetId: string;
  total: string;
  available: string;
  isLocked?: string;
}

export interface TransferRequest {
  fromWalletId: string;
  fromIndex: number;
  assetId: string;
  to: string;
  amount: string;
  fee?: string;
}

export interface TransferResult {
  txHash: string;
}

export interface TransactionStatus {
  txHash: string;
  confirmed: boolean;
  block?: number;
}
