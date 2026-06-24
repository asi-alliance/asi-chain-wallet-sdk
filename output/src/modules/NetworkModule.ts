export type NetworkId = string;

export interface AssetBalance {
    readonly assetId: string;
    readonly amount: string;
}

export interface BalanceSnapshot {
    readonly address: string;
    readonly balances: AssetBalance[];
    readonly timestamp: number;
}

export interface TransactionOverview {
    readonly transactionId: string;
    readonly networkId: NetworkId;
    readonly from: string;
    readonly to: string;
    readonly amount: string;
    readonly assetId: string;
    readonly timestamp: number;
    readonly status: string;
}

export interface ValidatorClient {
    validateAddress(address: string): Promise<boolean>;
}

export interface ObserverClient {
    getBalanceSnapshot(address: string): Promise<BalanceSnapshot>;
}

export interface IndexerClient {
    getTransactionHistory(address: string): Promise<TransactionOverview[]>;
    sendRawTransaction(payload: Uint8Array | string): Promise<string>;
}

export interface NetworkModule {
    readonly id: NetworkId;
    readonly name: string;

    createValidatorClient(): ValidatorClient;
    createObserverClient(): ObserverClient;
    createIndexerClient(): IndexerClient;
}
