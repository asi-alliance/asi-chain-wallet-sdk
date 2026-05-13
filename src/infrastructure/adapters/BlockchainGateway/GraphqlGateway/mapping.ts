/**
 * Anti-Corruption Layer (ACL)
 */

import type { Transaction } from "@/domain/aggregates/Transaction";
import type { NetworkName } from "@/domain/aggregates/Network/Network";
import { normalizeAddress } from "@/domain/aggregates/Wallet/mapping";
import { type RawTransfer } from "./GraphqlGateway";

type RawTransferMappingContext = {
    accountAddress: string;
    networkName: NetworkName;
};

export function mapRawTransferToTransaction(
    transfer: RawTransfer,
    context: RawTransferMappingContext,
): Transaction | undefined {
    const from = transfer.from_address?.trim();
    const to = transfer.to_address?.trim();

    if (!transfer.deploy_id || !from || !to) {
        return undefined;
    }

    return {
        id: transfer.deploy_id,
        timestamp: toDate(transfer.timestamp),
        type: getTransferType(from, to, context.accountAddress),
        from,
        to,
        amount: toOptionalString(transfer.amount_asi),
        deployId: transfer.deploy_id,
        blockHash: transfer.block_hash,
        status: "confirmed",
        networkName: context.networkName,
        detectedBy: "auto",
    };
}

function getTransferType(
    from: string,
    to: string,
    accountAddress: string,
): "send" | "receive" {
    const normalizedAccountAddress = normalizeAddress(accountAddress);

    return normalizeAddress(from) === normalizedAccountAddress
        ? "send"
        : "receive";
}

function toOptionalString(value: number | string | undefined): string | undefined {
    return value === undefined ? undefined : String(value);
}

function toDate(value: number | string | undefined): Date {
    if (value === undefined || value === "") {
        return new Date(0);
    }

    if (typeof value === "number") {
        return toDateFromNumericTimestamp(value);
    }

    const timestamp = value.trim();
    if (/^\d+$/.test(timestamp)) {
        return toDateFromNumericTimestamp(Number(timestamp));
    }

    const parsedTimestamp = Date.parse(timestamp);
    return Number.isFinite(parsedTimestamp)
        ? new Date(parsedTimestamp)
        : new Date(0);
}

function toDateFromNumericTimestamp(timestamp: number): Date {
    const milliseconds =
        timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;

    return new Date(milliseconds);
}
