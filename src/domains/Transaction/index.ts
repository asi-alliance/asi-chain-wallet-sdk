import { NetworkId } from "@domains/Network";
import { ITableRecord } from "@domains/TableService";

export const TRANSACTION_STATUSES = ["pending", "completed", "failed"] as const;

export const TRANSACTION_TYPES = ["send", "receive", "deploy"] as const;

export const TRANSACTION_DETECTED_BY_TYPES = [
    "balance_change",
    "manual",
    "auto",
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionDetectedBy =
    (typeof TRANSACTION_DETECTED_BY_TYPES)[number];

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
    networkId: NetworkId;
    detectedBy?: TransactionDetectedBy;
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

export interface ISerializedTransactionReservationPrivateData extends Omit<
    ITransactionReservationPrivateData,
    "transaction"
> {
    transaction: TSerializedTransaction;
}

export interface ITransactionReservation
    extends ITransactionReservationPrivateData, ITableRecord {
    networkId: NetworkId;
}

export type TReservationsByWallet = Record<string, ITransactionReservation[]>;
