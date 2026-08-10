import { NetworkId } from "@domains/Network";
import { ITableRecord } from "@domains/TableService";

export type TransactionStatus = "pending" | "completed" | "failed";
export type TransactionType = "send" | "receive" | "deploy";

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
