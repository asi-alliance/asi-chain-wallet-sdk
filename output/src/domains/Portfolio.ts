import { AssetDefinition } from "./Asset";

export interface BalanceItem {
    readonly asset: AssetDefinition;
    readonly amount: string;
}

export interface TransactionItem {
    readonly id: string;
    readonly networkId: string;
    readonly from: string;
    readonly to: string;
    readonly amount: string;
    readonly assetId: string;
    readonly timestamp: number;
    readonly status: string;
}

export interface Portfolio {
    readonly accountId: string;
    readonly networkId: string;
    readonly balances: BalanceItem[];
    readonly recentTransactions: TransactionItem[];
    readonly fetchedAt: number;
}
