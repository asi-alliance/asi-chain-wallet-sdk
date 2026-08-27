import StorageManager from "@services/StorageManager";
import TransactionReservationsManager, {
    ITransactionReservationsManagerOptions,
} from "@services/TransactionReservationsManager";
import {
    ISerializedTransactionReservationPrivateData,
    ITransactionReservation,
    Transaction,
} from "@domains/Transaction";
import { isSerializedTransactionReservationPrivateData } from "@utils/guards";
import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import { NetworkId } from "@domains/Network";
import ApiClientManager from "@domains/ApiClientManager";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE, GasFee } from "@config/index";
import { IDeployWatchCallbacks } from "@services/DeployStatusPoller";
import { IBalanceData } from "@services/AssetsService";
import Account from "@domains/Account";
import { ITransferDetails, TDeployDetails } from "@services/TransactionService";
import CryptoService, { EncryptedData } from "@services/Crypto";
import TransactionReservationFabric from "@fabrics/transactionReservation";
import { CorruptedDataSource } from "@domains/CustomError";
import {
    isSerializedReservationPrivateData,
    parseDecryptedJson,
} from "@utils/index";

export interface IReservedOperationResult {
    deployId: string;
    subscribe: (callbacks: IDeployWatchCallbacks) => () => void;
}

export default class ReservationAdapter {
    private readonly reservationsManager: TransactionReservationsManager;

    constructor(
        reservations: ITransactionReservation[],
        reservationsManagerOptions: ITransactionReservationsManagerOptions = {},
    ) {
        const releaseFromStorage = (
            reservation: ITransactionReservation,
        ): void => {
            StorageManager.deleteTransactionReservation(reservation.id).catch(
                (error: unknown) =>
                    console.error(
                        "ReservationAdapter: failed to delete released reservation:",
                        error,
                    ),
            );
        };

        this.reservationsManager = new TransactionReservationsManager(
            reservations,
            {
                ...reservationsManagerOptions,
                onConfirmed: (reservation: ITransactionReservation) => {
                    releaseFromStorage(reservation);

                    reservationsManagerOptions.onConfirmed?.(reservation);
                },
                onExpired: (reservation: ITransactionReservation) => {
                    releaseFromStorage(reservation);

                    reservationsManagerOptions.onExpired?.(reservation);
                },
            },
        );
    }

    private static async readPrivateData(
        record: ITransactionReservationsStorageRecord,
        dataKeySecret: string,
    ): Promise<unknown> {
        const decrypted: string = await CryptoService.decryptWithPassword(
            record.encryptedData,
            dataKeySecret,
        );

        return parseDecryptedJson(
            decrypted,
            CorruptedDataSource.RESERVATION_DATA,
            isSerializedReservationPrivateData,
        );
    }

    public static async create(
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
        reservationsManagerOptions?: ITransactionReservationsManagerOptions,
    ): Promise<ReservationAdapter> {
        const knownNetworkIds: Set<NetworkId> = new Set(
            ApiClientManager.getInstance().getNetworkIds(),
        );
        const signerId: string = wallet.getSigner().getId();

        const dataKeySecret: string = await wallet
            .getSigner()
            .resolveDataKey(passwordProvider);

        const records: ITransactionReservationsStorageRecord[] =
            await StorageManager.getTransactionReservationsBySignerId(signerId);

        const reservations: ITransactionReservation[] = [];

        for (const record of records) {
            const privateData: unknown =
                await ReservationAdapter.readPrivateData(record, dataKeySecret);

            if (
                !isSerializedTransactionReservationPrivateData(privateData) ||
                privateData.expirationTime <= Date.now() ||
                !knownNetworkIds.has(record.networkId)
            ) {
                await StorageManager.deleteTransactionReservation(record.id);

                continue;
            }

            reservations.push(
                TransactionReservationFabric.fromStorage(record, privateData),
            );
        }

        return new ReservationAdapter(reservations, reservationsManagerOptions);
    }

    private getReservedAmount(accountId: string, networkId: NetworkId): bigint {
        const reservations: ITransactionReservation[] =
            this.reservationsManager.getByAccountId(accountId, networkId);

        return reservations.reduce(
            (sum: bigint, reservation: ITransactionReservation) =>
                sum + BigInt(reservation.pendingAmount),
            0n,
        );
    }

    public async getBalance(account: Account): Promise<IBalanceData> {
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const balance: IBalanceData = await account.getBalance();

        const reserved: bigint = this.getReservedAmount(
            account.getId(),
            networkId,
        );

        const available: bigint = balance.amount - reserved;

        return {
            ...balance,
            amount: available > 0n ? available : 0n,
        };
    }

    public getReservations(): ITransactionReservation[] {
        return this.reservationsManager.getByNetworkId(
            ApiClientManager.getInstance().getCurrentNetworkId(),
        );
    }

    public getOutgoingPendingTransactions(account: Account): Transaction[] {
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const reservations: ITransactionReservation[] =
            this.reservationsManager.getByAccountId(account.getId(), networkId);

        return reservations.map((reservation: ITransactionReservation) =>
            TransactionReservationFabric.toPendingTransaction(
                reservation,
                account.getAddress(),
            ),
        );
    }

    public hasNetworkReservations(networkId: NetworkId): boolean {
        return this.reservationsManager.getByNetworkId(networkId).length > 0;
    }

    public async removeNetworkReservations(
        networkId: NetworkId,
    ): Promise<void> {
        const reservations: ITransactionReservation[] =
            this.reservationsManager.getByNetworkId(networkId);

        reservations.forEach((reservation: ITransactionReservation) =>
            this.reservationsManager.remove(reservation.id),
        );

        await StorageManager.deleteMultipleTransactionReservations(
            reservations.map(
                (reservation: ITransactionReservation) => reservation.id,
            ),
        );
    }

    public dispose(): void {
        this.reservationsManager.dispose();
    }

    private async persistReservation(
        reservation: ITransactionReservation,
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
    ): Promise<void> {
        const privateData: ISerializedTransactionReservationPrivateData =
            TransactionReservationFabric.toPrivateData(reservation);

        const dataKeySecret: string = await wallet
            .getSigner()
            .resolveDataKey(passwordProvider);

        const encryptedData: EncryptedData =
            await CryptoService.encryptWithPassword(
                JSON.stringify(privateData),
                dataKeySecret,
            );

        await StorageManager.saveTransactionReservation({
            id: reservation.id,
            networkId: reservation.networkId,
            signerId: wallet.getSigner().getId(),
            encryptedData,
        });
    }

    private async reserve(
        wallet: Wallet,
        deployId: string,
        reservation: ITransactionReservation,
        passwordProvider?: SecretsProvider,
    ): Promise<IReservedOperationResult> {
        await this.persistReservation(reservation, wallet, passwordProvider);

        this.reservationsManager.add(reservation);

        return {
            deployId,
            subscribe: (callbacks: IDeployWatchCallbacks) =>
                this.reservationsManager.subscribe(reservation.id, callbacks),
        };
    }

    public async validateSufficientBalance(
        account: Account,
        amount: bigint,
    ): Promise<boolean> {
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const totalReservedAmount: bigint =
            this.getReservedAmount(account.getId(), networkId) + amount;
        const remoteBalance: bigint = (await account.getBalance()).amount;

        return remoteBalance - totalReservedAmount > 0n;
    }

    public async transfer(
        wallet: Wallet,
        details: ITransferDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<IReservedOperationResult> {
        const account: Account = wallet.getActiveAccount()!;
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const pendingAmount: bigint = details.amount + GasFee.MAX;

        const isSufficientBalance: boolean =
            await this.validateSufficientBalance(account, pendingAmount);

        if (!isSufficientBalance) {
            throw new Error(
                "ReservationAdapter.transfer: Insufficient balance",
            );
        }

        const deployId: string = await wallet.transfer(
            details,
            passwordProvider,
        );

        const reservation: ITransactionReservation =
            TransactionReservationFabric.createTransfer({
                deployId,
                networkId,
                account,
                pendingAmount,
                details,
            });

        return this.reserve(wallet, deployId, reservation, passwordProvider);
    }

    public async deploy(
        wallet: Wallet,
        details: TDeployDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<IReservedOperationResult> {
        const account: Account = wallet.getActiveAccount()!;
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const pendingAmount: bigint =
            BigInt(details.phloLimit ?? DEFAULT_PHLO_LIMIT) *
            BigInt(details.phloPrice ?? DEFAULT_PHLO_PRICE);

        const isSufficientBalance: boolean =
            await this.validateSufficientBalance(account, pendingAmount);

        if (!isSufficientBalance) {
            throw new Error("ReservationAdapter.deploy: Insufficient balance");
        }

        const deployId: string = await wallet.deploy(details, passwordProvider);

        const reservation: ITransactionReservation =
            TransactionReservationFabric.createDeploy({
                deployId,
                networkId,
                account,
                pendingAmount,
                term: details.term,
            });

        return this.reserve(wallet, deployId, reservation, passwordProvider);
    }
}
