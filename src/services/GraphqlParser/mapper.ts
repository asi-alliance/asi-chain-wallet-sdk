/**
 * Anti-Corruption Layer (ACL)
 */

import { NetworkId } from "@domains/Network";
import { RawTransaction } from ".";
import {
    Transaction,
    TransactionStatus,
    TransactionType,
} from "@domains/Transaction";
import { normalizeAddress } from "@utils/functions";

type RawTransactionMappingContext = {
    accountAddress: string;
    networkId: NetworkId;
};

export function mapRawTransactionToTransaction(
    transaction: RawTransaction,
    context: RawTransactionMappingContext,
): Transaction {
    const from: string = (
        transaction.from_address ?? transaction.deployer_address
    ).trim();

    return {
        id: transaction.deploy_id,
        timestamp: toDate(transaction.timestamp),
        type: getTransactionType(transaction, from, context.accountAddress),
        from,
        to: transaction.to_address?.trim(),
        amount: toOptionalString(transaction.amount_asi),
        deployId: transaction.deploy_id,
        blockHash: transaction.block_hash,
        status: toTransactionStatus(transaction),
        networkId: context.networkId,
        detectedBy: "auto",
    };
}

function getTransactionType(
    transaction: RawTransaction,
    from: string,
    accountAddress: string,
): TransactionType {
    if (transaction.type === "not_transfer") {
        return "deploy";
    }

    return normalizeAddress(from) === normalizeAddress(accountAddress)
        ? "send"
        : "receive";
}

function toTransactionStatus(transaction: RawTransaction): TransactionStatus {
    return transaction.status === "failed" ? "failed" : "completed";
}

function toOptionalString(value: number | string | null): string | undefined {
    return value === null ? undefined : String(value);
}

function toDate(timestamp: number | string): Date {
    const epochTimestamp: number = Number(timestamp);

    const milliseconds: number =
        epochTimestamp < 10_000_000_000 ? epochTimestamp * 1000 : epochTimestamp;

    return new Date(milliseconds);
}