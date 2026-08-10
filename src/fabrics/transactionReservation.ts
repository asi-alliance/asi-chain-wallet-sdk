import Account from "@domains/Account";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { fromAtomicAmount, generateRandomId } from "@utils/index";
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
    Transaction,
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
        transaction: Transaction,
    ): ITransactionReservation {
        return {
            id: generateRandomId(),
            networkId,
            accountId: account.getId(),
            pendingAmount: pendingAmount.toString(),
            expirationTime: Date.now() + RESERVATION_EXPIRATION_TIME,
            transaction,
        };
    }

    public static createTransfer(
        payload: ICreateTransferReservationPayload,
    ): ITransactionReservation {
        const { deployId, networkId, account, details } = payload;

        return TransactionReservationFabric.build(payload, {
            id: deployId,
            deployId,
            timestamp: new Date(),
            type: "send",
            status: "pending",
            from: account.getAddress(),
            to: details.to,
            amount: fromAtomicAmount(
                details.amount,
                NATIVE_TOKEN_DECIMALS_AMOUNT,
            ),
            gasCost: fromAtomicAmount(GasFee.MAX, NATIVE_TOKEN_DECIMALS_AMOUNT),
            networkId,
            detectedBy: "manual",
        });
    }

    public static createDeploy(
        payload: ICreateDeployReservationPayload,
    ): ITransactionReservation {
        const { deployId, networkId, account, pendingAmount, term } = payload;

        return TransactionReservationFabric.build(payload, {
            id: deployId,
            deployId,
            timestamp: new Date(),
            type: "deploy",
            status: "pending",
            from: account.getAddress(),
            contractCode: term,
            gasCost: fromAtomicAmount(
                pendingAmount,
                NATIVE_TOKEN_DECIMALS_AMOUNT,
            ),
            networkId,
            detectedBy: "manual",
        });
    }

    public static toPrivateData({
        accountId,
        pendingAmount,
        expirationTime,
        transaction,
    }: ITransactionReservation): ISerializedTransactionReservationPrivateData {
        return {
            accountId,
            pendingAmount,
            expirationTime,
            transaction: {
                ...transaction,
                timestamp: transaction.timestamp.toISOString(),
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
            transaction: {
                ...privateData.transaction,
                timestamp: new Date(privateData.transaction.timestamp),
            },
        };
    }
}
