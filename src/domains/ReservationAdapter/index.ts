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
import ApiServiceRegistry from "@domains/ApiServiceRegistry";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE, GasFee } from "@config/index";
import { IDeployWatchCallbacks } from "@services/DeployStatusPoller";
import { IBalanceData } from "@services/AssetsService";
import Account from "@domains/Account";
import { ITransferDetails, TDeployDetails } from "@services/TransactionService";
import { SignedResult } from "@services/Signer";
import CryptoService, { EncryptedData } from "@services/Crypto";
import TransactionReservationFabric, {
    TCreateTransactionReservationPayload,
} from "@fabrics/transactionReservation";
import {
    CorruptedDataSource,
    DeploySubmissionRejectedError,
    IErrorContext,
    ReservationAction,
} from "@domains/CustomError";
import ReservationOperationGuardService from "@services/ReservationOperationGuard";
import {
    ensureValid,
    isRestorableReservationData,
    isSerializedReservationPrivateData,
    parseDecryptedJson,
    validatePositiveAmount,
    validateReservationPayload,
    validateReservationUpdateTarget,
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
        this.reservationsManager = new TransactionReservationsManager(
            reservations,
            {
                ...reservationsManagerOptions,
                onConfirmed: (reservation: ITransactionReservation) => {
                    void ReservationAdapter.releaseFromStorage(reservation.id);

                    reservationsManagerOptions.onConfirmed?.(reservation);
                },
                onExpired: (reservation: ITransactionReservation) => {
                    void ReservationAdapter.releaseFromStorage(reservation.id);

                    reservationsManagerOptions.onExpired?.(reservation);
                },
            },
        );
    }

    private static async releaseFromStorage(
        reservationId: ITransactionReservation["id"],
    ): Promise<void> {
        return StorageManager.deleteTransactionReservation(reservationId).catch(
            (error: unknown) =>
                console.error(
                    "ReservationAdapter: failed to delete released reservation:",
                    error,
                ),
        );
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
        ensureValid(validateReservationPayload(payload), {
            context: "ReservationAdapter.add",
        });

        return wallet.runAccountOperation(payload.account.getId(), () =>
            ReservationAdapter.operationsGuard.runReservationAction(
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
            ),
        );
    }

    public async update(
        wallet: Wallet,
        reservationId: ITransactionReservation["id"],
        payload: TCreateTransactionReservationPayload,
        passwordProvider?: SecretsProvider,
    ): Promise<ITransactionReservation> {
        ensureValid(validateReservationPayload(payload), {
            context: "ReservationAdapter.update",
        });

        return wallet.runAccountOperation(payload.account.getId(), () =>
            ReservationAdapter.operationsGuard.runReservationAction(
                ReservationAction.UPDATE,
                {
                    accountId: payload.account.getId(),
                    networkId: payload.networkId,
                    deployId: payload.deployId,
                    reservationId,
                },
                () =>
                    this.reservationsManager.runExclusive(
                        reservationId,
                        async () => {
                            const currentReservation: ITransactionReservation =
                                this.reservationsManager.getKnown(
                                    reservationId,
                                );

                            ensureValid(
                                validateReservationUpdateTarget(
                                    currentReservation,
                                    payload,
                                ),
                                { context: "ReservationAdapter.update" },
                            );

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
                                TransactionReservationFabric.create(
                                    payload,
                                    reservationId,
                                );

                            await this.updatePersistedReservation(
                                reservation,
                                wallet,
                                passwordProvider,
                            );

                            this.reservationsManager.replace(reservation);

                            return reservation;
                        },
                    ),
            ),
        );
    }

    public async remove(
        id: ITransactionReservation["id"],
    ): Promise<ITransactionReservation> {
        const targetReservation: ITransactionReservation =
            this.reservationsManager.getKnown(id);

        return ReservationAdapter.operationsGuard.runReservationAction(
            ReservationAction.REMOVE,
            {
                accountId: targetReservation.accountId,
                networkId: targetReservation.networkId,
                reservationId: id,
            },
            () =>
                this.reservationsManager.runExclusive(id, async () => {
                    await StorageManager.deleteTransactionReservation(id);

                    return this.reservationsManager.remove(id);
                }),
        );
    }

    public getReservation(
        id: ITransactionReservation["id"],
    ): ITransactionReservation {
        return this.reservationsManager.getKnown(id);
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
                !isRestorableReservationData(
                    privateData,
                    record.networkId,
                    knownNetworkIds,
                )
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
            this.reservationsManager.removeByNetworkId(networkId);

        await StorageManager.deleteMultipleTransactionReservations(
            reservations.map(
                (reservation: ITransactionReservation) => reservation.id,
            ),
        );
    }

    public dispose(): void {
        this.reservationsManager.close();
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

    private async settleFailedSubmission(
        reservation: ITransactionReservation,
        error: unknown,
    ): Promise<void> {
        if (error instanceof DeploySubmissionRejectedError) {
            await ReservationAdapter.releaseFromStorage(reservation.id);

            return;
        }

        this.reservationsManager.add(reservation.id, reservation);
    }

    private async reserveAndSubmit(
        wallet: Wallet,
        signedDeploy: SignedResult,
        reservation: ITransactionReservation,
        passwordProvider?: SecretsProvider,
    ): Promise<IReservedOperationResult> {
        await this.persistReservation(reservation, wallet, passwordProvider);

        try {
            await ApiServiceRegistry.getInstance().transactions.submitSignedDeploy(
                signedDeploy,
            );
        } catch (error: unknown) {
            await this.settleFailedSubmission(reservation, error);

            throw error;
        }

        this.reservationsManager.add(reservation.id, reservation);

        return {
            deployId: reservation.details.deployId,
            subscribe: (callbacks: IDeployWatchCallbacks) =>
                this.reservationsManager.subscribe(reservation.id, callbacks),
        };
    }

    public async transfer(
        wallet: Wallet,
        accountId: string,
        details: ITransferDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<IReservedOperationResult> {
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const pendingAmount: bigint = details.amount + GasFee.MAX;

        ensureValid(validatePositiveAmount(pendingAmount), {
            context: "ReservationAdapter.transfer",
        });

        return wallet.runAccountOperation(accountId, (account: Account) =>
            ReservationAdapter.operationsGuard.runReservationAction(
                ReservationAction.TRANSFER,
                { accountId, networkId },
                () =>
                    ApiClientManager.getInstance().runNetworkOperation(
                        async () => {
                            await this.ensureSufficientBalance(
                                account,
                                pendingAmount,
                                { context: "ReservationAdapter.transfer" },
                            );

                            const signedDeploy: SignedResult =
                                await wallet.signTransfer(
                                    accountId,
                                    details,
                                    passwordProvider,
                                );

                            const reservation: ITransactionReservation =
                                TransactionReservationFabric.createTransfer({
                                    kind: "transfer",
                                    deployId: signedDeploy.signature,
                                    networkId,
                                    account,
                                    pendingAmount,
                                    details,
                                });

                            return this.reserveAndSubmit(
                                wallet,
                                signedDeploy,
                                reservation,
                                passwordProvider,
                            );
                        },
                        { networkId },
                    ),
            ),
        );
    }

    public async deploy(
        wallet: Wallet,
        accountId: string,
        details: TDeployDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<IReservedOperationResult> {
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const pendingAmount: bigint =
            BigInt(details.phloLimit ?? DEFAULT_PHLO_LIMIT) *
            BigInt(details.phloPrice ?? DEFAULT_PHLO_PRICE);

        ensureValid(validatePositiveAmount(pendingAmount), {
            context: "ReservationAdapter.deploy",
        });

        return wallet.runAccountOperation(accountId, (account: Account) =>
            ReservationAdapter.operationsGuard.runReservationAction(
                ReservationAction.DEPLOY,
                { accountId, networkId },
                () =>
                    ApiClientManager.getInstance().runNetworkOperation(
                        async () => {
                            await this.ensureSufficientBalance(
                                account,
                                pendingAmount,
                                { context: "ReservationAdapter.deploy" },
                            );

                            const signedDeploy: SignedResult =
                                await wallet.signDeploy(
                                    accountId,
                                    details,
                                    passwordProvider,
                                );

                            const reservation: ITransactionReservation =
                                TransactionReservationFabric.createDeploy({
                                    kind: "deploy",
                                    deployId: signedDeploy.signature,
                                    networkId,
                                    account,
                                    pendingAmount,
                                    term: details.term,
                                });

                            return this.reserveAndSubmit(
                                wallet,
                                signedDeploy,
                                reservation,
                                passwordProvider,
                            );
                        },
                        { networkId },
                    ),
            ),
        );
    }
}
