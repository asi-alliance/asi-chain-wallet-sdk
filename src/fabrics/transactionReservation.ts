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
    ITransactionReservation,
    ITransactionReservationPrivateData,
    Transaction,
} from "@domains/Transaction";

export interface ICreateTransactionReservationPayload {
    deployId: string;
    networkId: NetworkId;
    account: Account;
    details: {
        to: Address;
        amount: bigint;
    };
}

export default class TransactionReservationFabric {
    public static create({
        deployId,
        networkId,
        account,
        details,
    }: ICreateTransactionReservationPayload): ITransactionReservation {
        const transaction: Transaction = {
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
        };

        return {
            id: generateRandomId(),
            networkId,
            accountId: account.getId(),
            pendingAmount: details.amount.toString(),
            expirationTime: Date.now() + RESERVATION_EXPIRATION_TIME,
            transaction,
        };
    }

    public static fromStorage(
        record: ITransactionReservationsStorageRecord,
        privateData: ITransactionReservationPrivateData,
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
