import { NetworkId } from "@domains/Network";
import { ITableRecord } from "@domains/TableService";
import { QueryOptions } from "@services/GraphqlParser/queryOptions";

export type TransactionStatus = "pending" | "completed" | "failed";
export type TransactionType = "send" | "receive" | "deploy";

export type TTransactionStatusFilter = Exclude<TransactionStatus, "pending">;

export interface ITransactionsHistoryPeriod {
    from?: Date;
    to?: Date;
}

export interface ITransactionsHistoryFilters {
    type?: TransactionType;
    status?: TTransactionStatusFilter;
    period?: ITransactionsHistoryPeriod;
}

export interface ITransactionsHistoryQuery extends QueryOptions {
    filters?: ITransactionsHistoryFilters;
}

export interface ITransactionsHistoryPage {
    items: Transaction[];
    total: number;
}

export interface Transaction {
    id: string;
    timestamp: Date;
    type: TransactionType;
    from: string;
    to?: string;
    amount?: string;
    deployId?: string;
    blockHash?: string;
    gasCost?: string;
    status: TransactionStatus;
    contractCode?: string;
    note?: string;
    networkId: NetworkId;
    detectedBy?: "balance_change" | "manual" | "auto";
}

export type TSerializedTransaction = Omit<Transaction, "timestamp"> & {
    timestamp: string;
};

export interface ITransactionReservationPrivateData {
    accountId: string;
    pendingAmount: string;
    expirationTime: number;
    transaction: Transaction;
}

export interface ISerializedTransactionReservationPrivateData
    extends Omit<ITransactionReservationPrivateData, "transaction"> {
    transaction: TSerializedTransaction;
}

export interface ITransactionReservation
    extends ITransactionReservationPrivateData, ITableRecord {
    networkId: NetworkId;
}

export type TReservationsByWallet = Record<string, ITransactionReservation[]>;
