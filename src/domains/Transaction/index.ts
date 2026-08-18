import { NetworkId } from "@domains/Network";
import { ITableRecord } from "@domains/TableService";

export type TransactionStatus = "pending" | "completed" | "failed";
export type TransactionType = "send" | "receive" | "deploy";
export type TransactionReservationKind = "transfer" | "deploy";

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

export interface ITransactionReservationDetails {
    deployId: string;
    timestamp: Date;
    from: string;
    to?: string;
    amount?: string;
    gasCost?: string;
    contractCode?: string;
}

export type TSerializedTransactionReservationDetails = Omit<
    ITransactionReservationDetails,
    "timestamp"
> & {
    timestamp: string;
};

export interface ITransactionReservationPrivateData {
    accountId: string;
    pendingAmount: string;
    expirationTime: number;
    kind: TransactionReservationKind;
    details: ITransactionReservationDetails;
}

export interface ISerializedTransactionReservationPrivateData
    extends Omit<ITransactionReservationPrivateData, "details"> {
    details: TSerializedTransactionReservationDetails;
}

export interface ITransactionReservation
    extends ITransactionReservationPrivateData, ITableRecord {
    networkId: NetworkId;
}

export type TReservationsByWallet = Record<string, ITransactionReservation[]>;