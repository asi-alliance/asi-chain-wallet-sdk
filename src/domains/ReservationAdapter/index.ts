import StorageManager from "@services/StorageManager";
import TransactionReservationsManager, {
    ITransactionReservationsManagerOptions,
} from "@services/TransactionReservationsManager";
import {
    ISerializedTransactionReservationPrivateData,
    ITransactionReservation,
    Transaction,
} from "@domains/Transaction";
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
import TransactionReservationFabric, {
    TCreateTransactionReservationPayload,
} from "@fabrics/transactionReservation";
import {
    CorruptedDataSource,
    IErrorContext,
    ReservationAction,
} from "@domains/CustomError";
import ReservationOperationGuardService from "@services/ReservationOperationGuard";
import {
    isSerializedReservationPrivateData,
    parseDecryptedJson,
} from "@utils/index";

export interface IReservedOperationResult {
    deployId: string;
    subscribe: (callbacks: IDeployWatchCallbacks) => () => void;
}

export default class ReservationAdapter {
    private static readonly operationsGuard: ReservationOperationGuardService =
        ReservationOperationGuardService.getInstance();

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

    private ensurePositiveAmount(
        amount: bigint,
        { context }: IErrorContext,
    ): void {
        if (amount <= 0n) {
            throw new Error(`${context}: Amount should be greater than zero`);
        }
    }

    private async ensureSufficientBalance(
        account: Account,
        amount: bigint,
        { context }: IErrorContext,
    ): Promise<void> {
        const isSufficientBalance: boolean =
            await this.validateSufficientBalance(account, amount);

        if (!isSufficientBalance) {
            throw new Error(`${context}: Insufficient balance`);
        }
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

        return remoteBalance - totalReservedAmount >= 0n;
    }

    public async add(
        wallet: Wallet,
        payload: TCreateTransactionReservationPayload,
        passwordProvider?: SecretsProvider,
    ): Promise<ITransactionReservation> {
        this.ensurePositiveAmount(payload.pendingAmount, {
            context: "ReservationAdapter.add",
        });

        return ReservationAdapter.operationsGuard.runReservationAction(
            ReservationAction.ADD,
            {
                accountId: payload.account.getId(),
                networkId: payload.networkId,
                deployId: payload.deployId,
            },
            async () => {
                this.reservationsManager.ensureUniqueDeployId(
                    payload.deployId,
                    payload.networkId,
                );

                await this.ensureSufficientBalance(
                    payload.account,
                    payload.pendingAmount,
                    { context: "ReservationAdapter.add" },
                );

                const reservation: ITransactionReservation =
                    TransactionReservationFabric.create(payload);

                await this.persistReservation(
                    reservation,
                    wallet,
                    passwordProvider,
                );

                this.reservationsManager.add(reservation.id, reservation);

                return reservation;
            },
        );
    }

    public async update(
        wallet: Wallet,
        reservationId: ITransactionReservation["id"],
        payload: TCreateTransactionReservationPayload,
        passwordProvider?: SecretsProvider,
    ): Promise<ITransactionReservation> {
        this.ensurePositiveAmount(payload.pendingAmount, {
            context: "ReservationAdapter.update",
        });

        return ReservationAdapter.operationsGuard.runReservationAction(
            ReservationAction.UPDATE,
            {
                accountId: payload.account.getId(),
                networkId: payload.networkId,
                deployId: payload.deployId,
                reservationId,
            },
            async () => {
                const currentReservation: ITransactionReservation =
                    this.reservationsManager.getKnown(reservationId);

                if (currentReservation.accountId !== payload.account.getId()) {
                    throw new Error(
                        "ReservationAdapter.update: Reservation cannot be moved to another account",
                    );
                }

                if (currentReservation.networkId !== payload.networkId) {
                    throw new Error(
                        "ReservationAdapter.update: Reservation cannot be moved to another network",
                    );
                }

                this.reservationsManager.ensureUniqueDeployId(
                    payload.deployId,
                    payload.networkId,
                    reservationId,
                );

                const pendingAmountDelta: bigint =
                    payload.pendingAmount -
                    BigInt(currentReservation.pendingAmount);

                await this.ensureSufficientBalance(
                    payload.account,
                    pendingAmountDelta,
                    { context: "ReservationAdapter.update" },
                );

                const reservation: ITransactionReservation =
                    TransactionReservationFabric.create(payload, reservationId);

                await this.updatePersistedReservation(
                    reservation,
                    wallet,
                    passwordProvider,
                );

                this.reservationsManager.replace(reservation);

                return reservation;
            },
        );
    }

    public async remove(
        id: ITransactionReservation["id"],
    ): Promise<ITransactionReservation> {
        const { accountId, networkId }: ITransactionReservation =
            this.reservationsManager.getKnown(id);

        return ReservationAdapter.operationsGuard.runReservationAction(
            ReservationAction.REMOVE,
            { accountId, networkId, reservationId: id },
            async () => {
                await StorageManager.deleteTransactionReservation(id);

                return this.reservationsManager.remove(id);
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
                !isSerializedReservationPrivateData(privateData) ||
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

    private async encryptReservationData(
        reservation: ITransactionReservation,
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
    ): Promise<EncryptedData> {
        const privateData: ISerializedTransactionReservationPrivateData =
            TransactionReservationFabric.toPrivateData(reservation);

        const dataKeySecret: string = await wallet
            .getSigner()
            .resolveDataKey(passwordProvider);

        return CryptoService.encryptWithPassword(
            JSON.stringify(privateData),
            dataKeySecret,
        );
    }

    private async persistReservation(
        reservation: ITransactionReservation,
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
    ): Promise<void> {
        const encryptedData: EncryptedData = await this.encryptReservationData(
            reservation,
            wallet,
            passwordProvider,
        );

        await StorageManager.saveTransactionReservation({
            id: reservation.id,
            networkId: reservation.networkId,
            signerId: wallet.getSigner().getId(),
            encryptedData,
        });
    }

    private async updatePersistedReservation(
        reservation: ITransactionReservation,
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
    ): Promise<void> {
        const encryptedData: EncryptedData = await this.encryptReservationData(
            reservation,
            wallet,
            passwordProvider,
        );

        await StorageManager.updateTransactionReservation(reservation.id, {
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

        this.reservationsManager.add(reservation.id, reservation);

        return {
            deployId,
            subscribe: (callbacks: IDeployWatchCallbacks) =>
                this.reservationsManager.subscribe(reservation.id, callbacks),
        };
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

        this.ensurePositiveAmount(pendingAmount, {
            context: "ReservationAdapter.transfer",
        });

        await this.ensureSufficientBalance(account, pendingAmount, {
            context: "ReservationAdapter.transfer",
        });

        const deployId: string = await wallet.transfer(
            details,
            passwordProvider,
        );

        const reservation: ITransactionReservation =
            TransactionReservationFabric.createTransfer({
                kind: "transfer",
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

        this.ensurePositiveAmount(pendingAmount, {
            context: "ReservationAdapter.deploy",
        });

        await this.ensureSufficientBalance(account, pendingAmount, {
            context: "ReservationAdapter.deploy",
        });

        const deployId: string = await wallet.deploy(details, passwordProvider);

        const reservation: ITransactionReservation =
            TransactionReservationFabric.createDeploy({
                kind: "deploy",
                deployId,
                networkId,
                account,
                pendingAmount,
                term: details.term,
            });

        return this.reserve(wallet, deployId, reservation, passwordProvider);
    }
}
