/**
 * Anti-Corruption Layer (ACL)
 */

import { NetworkId } from "@domains/Network";
import { RawDeployment, RawTransfer } from ".";
import { Transaction } from "@domains/Transaction";
import { normalizeAddress } from "@utils/functions";

type RawTransferMappingContext = {
    accountAddress: string;
    networkId: NetworkId;
};

type RawDeploymentMappingContext = {
    networkId: NetworkId;
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
        networkId: context.networkId,
        detectedBy: "auto",
    };
}

export function mapRawDeploymentToTransaction(
    deployment: RawDeployment,
    context: RawDeploymentMappingContext,
): Transaction | undefined {
    const from = deployment.deployer?.trim();

    if (!deployment.deploy_id || !from) {
        return undefined;
    }

    return {
        id: deployment.deploy_id,
        timestamp: toDate(deployment.timestamp),
        type: "deploy",
        from,
        deployId: deployment.deploy_id,
        blockHash: deployment.block?.block_hash,
        status: "confirmed",
        networkId: context.networkId,
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

function toOptionalString(
    value: number | string | undefined,
): string | undefined {
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
