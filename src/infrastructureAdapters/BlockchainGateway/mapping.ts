/**
 * Anti-Corruption Layer (ACL)
 */

import { Transaction } from "@domains/";
import { type RawTransfer } from "./GraphqlGateway";

export function mapRawTxtoTx(
        tx: RawTransfer,
    ): Transaction {
        return {
            id: tx.deployId,
            timestamp: new Date(tx.timestamp),
            type: tx.type,
            from: tx.from,
            to: tx.to,
            amount: tx.amount,
            deployId: tx.deployId,
            blockHash: tx.blockHash,
            status: tx.status,
            networkName: tx.networkName,
            detectedBy: 'auto'
        };
}