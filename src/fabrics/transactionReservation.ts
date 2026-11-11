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
    nativeTokenDecimals: number;
    deployId: string;
    networkId: NetworkId;
    account: Account;
    pendingAmount: bigint;
    kind: TransactionReservationKind;
    gasCost?: bigint;
}

export interface ICreateTransferReservationPayload extends IReservationPayload {
    kind: "transfer";
    details: {
        to: Address;
        amount: bigint;
    };
}

export interface ICreateDeployReservationPayload extends IReservationPayload {
    kind: "deploy";
    term?: string;
}

export type TCreateTransactionReservationPayload =
    | ICreateTransferReservationPayload
    | ICreateDeployReservationPayload;

interface IReservationMeta {
    deployId: string;
    pendingAmount: bigint;
    gasCost: bigint;
}

export interface ITransferReservationMeta extends IReservationMeta {
    kind: "transfer";
    to: Address;
    amount: bigint;
}

export interface IDeployReservationMeta extends IReservationMeta {
    kind: "deploy";
    term?: string;
}

export type TTransactionReservationMeta =
    | ITransferReservationMeta
    | IDeployReservationMeta;

export default class TransactionReservationFabric {
    private static build(
        payload: IReservationPayload,
        details: ITransactionReservationDetails,
        id: string,
    ): ITransactionReservation {
        const { networkId, account, pendingAmount, kind, nativeTokenDecimals } =
            payload;

        return {
            id,
            nativeTokenDecimals,
            networkId,
            accountId: account.getId(),
            pendingAmount: pendingAmount.toString(),
            expirationTime: Date.now() + RESERVATION_EXPIRATION_TIME,
            kind,
            details,
        };
    }

    public static toCreatePayload(
        meta: TTransactionReservationMeta,
        account: Account,
        networkId: NetworkId,
        nativeTokenDecimals: number,
    ): TCreateTransactionReservationPayload {
        const { deployId, pendingAmount, gasCost } = meta;

        if (meta.kind === "deploy") {
            return {
                kind: "deploy",
                deployId,
                networkId,
                nativeTokenDecimals,
                account,
                pendingAmount,
                gasCost,
                term: meta.term,
            };
        }

        return {
            kind: "transfer",
            deployId,
            networkId,
            nativeTokenDecimals,
            account,
            pendingAmount,
            gasCost,
            details: {
                to: meta.to,
                amount: meta.amount,
            },
        };
    }

    public static createTransfer(
        payload: ICreateTransferReservationPayload,
        id: string = generateRandomId(),
    ): ITransactionReservation {
        const { deployId, account, details, gasCost, nativeTokenDecimals } =
            payload;

        return TransactionReservationFabric.build(
            payload,
            {
                deployId,
                timestamp: new Date(),
                from: account.getAddress(),
                to: details.to,
                amount: fromAtomicAmount(details.amount, nativeTokenDecimals),
                gasCost: fromAtomicAmount(
                    gasCost ?? GasFee.MAX,
                    nativeTokenDecimals,
                ),
            },
            id,
        );
    }

    public static createDeploy(
        payload: ICreateDeployReservationPayload,
        id: string = generateRandomId(),
    ): ITransactionReservation {
        const {
            deployId,
            account,
            pendingAmount,
            term,
            gasCost,
            nativeTokenDecimals,
        } = payload;

        return TransactionReservationFabric.build(
            payload,
            {
                deployId,
                timestamp: new Date(),
                from: account.getAddress(),
                gasCost: fromAtomicAmount(
                    gasCost ?? pendingAmount,
                    nativeTokenDecimals,
                ),
                contractCode: term,
            },
            id,
        );
    }

    public static create(
        payload: TCreateTransactionReservationPayload,
        id: string = generateRandomId(),
    ): ITransactionReservation {
        return payload.kind === "transfer"
            ? TransactionReservationFabric.createTransfer(payload, id)
            : TransactionReservationFabric.createDeploy(payload, id);
    }

    public static toPendingTransaction(
        {
            networkId,
            kind,
            details,
            nativeTokenDecimals,
        }: ITransactionReservation,
        viewerAddress: Address,
    ): Transaction {
        return {
            id: details.deployId,
            nativeTokenDecimals,
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
        nativeTokenDecimals,
        pendingAmount,
        expirationTime,
        kind,
        details,
    }: ITransactionReservation): ISerializedTransactionReservationPrivateData {
        return {
            accountId,
            nativeTokenDecimals,
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
            // TODO: drop the 8-decimal fallback once Dev and DevNet both run
            // the Rust node with 18 decimals and reservations stored before
            // nativeTokenDecimals was persisted have expired.
            nativeTokenDecimals:
                privateData.nativeTokenDecimals ?? NATIVE_TOKEN_DECIMALS_AMOUNT,
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
