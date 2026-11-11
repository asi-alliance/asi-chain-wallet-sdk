import { NetworkId } from "@domains/Network";
import { RawDeployment, RawTransfer } from ".";
import { Transaction } from "@domains/Transaction";
import { resolveTransferType } from "@utils/functions";
import { DECIMAL_REGEX } from "@utils/constants";

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
        type: resolveTransferType(from, context.accountAddress),
        from,
        to,
        amount: toOptionalString(transfer.amount_asi),
        deployId: transfer.deploy_id,
        blockHash: transfer.block_hash,
        status: "completed",
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
        status: "completed",
        networkId: context.networkId,
        detectedBy: "auto",
    };
}

function toOptionalString(
    value: number | string | undefined,
): string | undefined {
    if (typeof value === "string") {
        return DECIMAL_REGEX.test(value) ? value : undefined;
    }

    // TODO: accept only decimal strings once the DevNet indexer stops
    // returning amounts as JSON numbers.
    const isExactNumber: boolean =
        typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value) <= Number.MAX_SAFE_INTEGER;

    return isExactNumber ? String(value) : undefined;
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
