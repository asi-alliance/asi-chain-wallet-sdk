import {
    Balance,
    TransferRequest,
    TransferResult,
    TransactionStatus,
} from "../../types";

export interface RpcClient {
    getBalance(address: string, assetId: string): Promise<Balance>;
    getBalances(address: string, assetIds: string[]): Promise<Balance[]>;
    buildTransferTx(request: TransferRequest): Promise<Uint8Array>;
    estimateTransferFee(request: TransferRequest): Promise<string>;
    sendTransaction(signedTx: Uint8Array): Promise<TransferResult>;
    getTransactionStatus(txHash: string): Promise<TransactionStatus>;
}
