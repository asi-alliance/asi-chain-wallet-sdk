import { NetworkName } from "@domains/Network";

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
    networkName: NetworkName; //TODO: clarify what network data will be stored
    detectedBy?: "balance_change" | "manual" | "auto";
}
