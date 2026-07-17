import { NetworkId } from "@domains/Network";
import { ITableRecord } from "@domains/TableService";

type TransactionStatus = "pending" | "confirmed" | "failed";

export interface Transaction {
    id: string;
    timestamp: Date;
    type: "send" | "receive" | "deploy";
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

export interface ITransactionReservationPrivateData {
    timestamp: Date;
    accountAddress: string;
    pendingAmount: string;
    deployId: string;
    expirationTime: number;
}

export interface ITransactionReservation
    extends ITransactionReservationPrivateData, ITableRecord {
    networkId: NetworkId;
}
