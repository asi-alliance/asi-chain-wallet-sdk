import Account from "@domains/Account";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import {
    fromAtomicAmount,
    generateRandomId,
    resolveTransferType,
} from "@utils/index";
import { NetworkId } from "@domains/Network";
import { Address } from "@domains/Wallet";
import {
    GasFee,
    NATIVE_TOKEN_DECIMALS_AMOUNT,
    RESERVATION_EXPIRATION_TIME,
} from "@config/index";
import {
    ISerializedTransactionReservationPrivateData,
    ITransactionReservation,
    ITransactionReservationDetails,
    Transaction,
    TransactionReservationKind,
} from "@domains/Transaction";

interface IReservationPayload {
    deployId: string;
    networkId: NetworkId;
    account: Account;
    pendingAmount: bigint;
}

export interface ICreateTransferReservationPayload extends IReservationPayload {
    details: {
        to: Address;
        amount: bigint;
    };
}

export interface ICreateDeployReservationPayload extends IReservationPayload {
    term: string;
}

export default class TransactionReservationFabric {
    private static build(
        { networkId, account, pendingAmount }: IReservationPayload,
        kind: TransactionReservationKind,
        details: ITransactionReservationDetails,
    ): ITransactionReservation {
        return {
            id: generateRandomId(),
            networkId,
            accountId: account.getId(),
            pendingAmount: pendingAmount.toString(),
            expirationTime: Date.now() + RESERVATION_EXPIRATION_TIME,
            kind,
            details,
        };
    }

    public static createTransfer(
        payload: ICreateTransferReservationPayload,
    ): ITransactionReservation {
        const { deployId, account, details } = payload;

        return TransactionReservationFabric.build(payload, "transfer", {
            deployId,
            timestamp: new Date(),
            from: account.getAddress(),
            to: details.to,
            amount: fromAtomicAmount(
                details.amount,
                NATIVE_TOKEN_DECIMALS_AMOUNT,
            ),
            gasCost: fromAtomicAmount(GasFee.MAX, NATIVE_TOKEN_DECIMALS_AMOUNT),
        });
    }

    public static createDeploy(
        payload: ICreateDeployReservationPayload,
    ): ITransactionReservation {
        const { deployId, account, pendingAmount, term } = payload;

        return TransactionReservationFabric.build(payload, "deploy", {
            deployId,
            timestamp: new Date(),
            from: account.getAddress(),
            gasCost: fromAtomicAmount(
                pendingAmount,
                NATIVE_TOKEN_DECIMALS_AMOUNT,
            ),
            contractCode: term,
        });
    }

    public static toPendingTransaction(
        { networkId, kind, details }: ITransactionReservation,
        viewerAddress: Address,
    ): Transaction {
        return {
            id: details.deployId,
            deployId: details.deployId,
            timestamp: details.timestamp,
            type:
                kind === "deploy"
                    ? "deploy"
                    : resolveTransferType(details.from, viewerAddress),
            status: "pending",
            from: details.from,
            to: details.to,
            amount: details.amount,
            gasCost: details.gasCost,
            contractCode: details.contractCode,
            networkId,
            detectedBy: "manual",
        };
    }

    public static toPrivateData({
        accountId,
        pendingAmount,
        expirationTime,
        kind,
        details,
    }: ITransactionReservation): ISerializedTransactionReservationPrivateData {
        return {
            accountId,
            pendingAmount,
            expirationTime,
            kind,
            details: {
                ...details,
                timestamp: details.timestamp.toISOString(),
            },
        };
    }

    public static fromStorage(
        record: ITransactionReservationsStorageRecord,
        privateData: ISerializedTransactionReservationPrivateData,
    ): ITransactionReservation {
        return {
            id: record.id,
            networkId: record.networkId,
            accountId: privateData.accountId,
            pendingAmount: privateData.pendingAmount,
            expirationTime: privateData.expirationTime,
            kind: privateData.kind,
            details: {
                ...privateData.details,
                timestamp: new Date(privateData.details.timestamp),
            },
        };
    }
}