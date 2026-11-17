import StorageManager from "@services/StorageManager";
import TransactionReservationsManager, {
    ITransactionReservationsManagerOptions,
} from "@services/TransactionReservationsManager";
import {
    ISerializedTransactionReservationPrivateData,
    ITransactionReservation,
    ITransactionReservationInput,
    Transaction,
} from "@domains/Transaction";
import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import { NetworkId } from "@domains/Network";
import ApiClientManager from "@domains/ApiClientManager";
import ApiServiceRegistry from "@domains/ApiServiceRegistry";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { SUBMISSION_SETTLE_TIMEOUT_MS } from "@config/index";
import { IDeployWatchCallbacks } from "@services/DeployStatusPoller";
import { IBalanceData } from "@services/AssetsService";
import Account from "@domains/Account";
import { ITransferDetails, TDeployDetails } from "@services/TransactionService";
import { SignedResult } from "@services/Signer";
import CryptoService, { EncryptedData } from "@services/Crypto";
import TransactionReservationFabric, {
    TCreateTransactionReservationPayload,
    TWithNativeTokenDecimals,
} from "@fabrics/transactionReservation";
import { createDeployPhlo, IDeployPhlo } from "@fabrics/deployPhlo";
import {
    CorruptedDataSource,
    DeploySubmissionRejectedError,
    DeployVerdictError,
    DomainClosedError,
    IErrorContext,
    ReservationAction,
    WalletAction,
    WalletActionInProgressError,
} from "@domains/CustomError";
import ReservationOperationGuardService from "@services/ReservationOperationGuard";
import KeyedLifecycleGuardService from "@services/KeyedLifecycleGuard";
import { EnsureReservationsManagerActive } from "@utils/decorators/reservationAdapter";
import {
    ensureValid,
    isRestorableReservationData,
    isSerializedReservationPrivateData,
    parseDecryptedJson,
    validatePhloSettings,
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
    private static readonly submissionsGuard: KeyedLifecycleGuardService =
        new KeyedLifecycleGuardService();

    private readonly reservationsManager: TransactionReservationsManager;

    constructor(
        reservations: ITransactionReservationInput[],
        reservationsManagerOptions: ITransactionReservationsManagerOptions = {},
    ) {
        this.reservationsManager = new TransactionReservationsManager(
            reservations.map((reservation: ITransactionReservationInput) =>
                ReservationAdapter.withNetworkPrecision(reservation),
            ),
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
                onFailed: (
                    reservation: ITransactionReservation,
                    error: Error,
                ) => {
                    // The manager already released a terminal verdict's
                    // reservation from memory; release its stored copy too.
                    if (error instanceof DeployVerdictError) {
                        void ReservationAdapter.releaseFromStorage(
                            reservation.id,
                        );
                    }

                    reservationsManagerOptions.onFailed?.(reservation, error);
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

    private static withNetworkPrecision<
        T extends { networkId: NetworkId; nativeTokenDecimals?: number },
    >(value: T): TWithNativeTokenDecimals<T> {
        return {
            ...value,
            nativeTokenDecimals:
                value.nativeTokenDecimals ??
                ApiClientManager.getInstance().getNetwork(value.networkId)
                    .config.nativeTokenDecimals,
        };
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
                        TransactionReservationFabric.create(
                            ReservationAdapter.withNetworkPrecision(payload),
                        );

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
                                    ReservationAdapter.withNetworkPrecision(
                                        payload,
                                    ),
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

        await ReservationAdapter.submissionsGuard.drain(
            signerId,
            SUBMISSION_SETTLE_TIMEOUT_MS,
        );

        if (ReservationAdapter.submissionsGuard.hasPendingOperations(signerId)) {
            throw new WalletActionInProgressError(
                WalletAction.SUBMIT_DEPLOY,
                signerId,
            );
        }

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
        if (
            error instanceof DeploySubmissionRejectedError ||
            error instanceof DomainClosedError
        ) {
            await ReservationAdapter.releaseFromStorage(reservation.id);

            return;
        }

        this.reservationsManager.add(reservation.id, reservation);
    }

    @EnsureReservationsManagerActive
    private submit(signedDeploy: SignedResult): Promise<string> {
        return ApiServiceRegistry.getInstance().transactions.submitSignedDeploy(
            signedDeploy,
        );
    }

    private async reserveAndSubmit(
        wallet: Wallet,
        signedDeploy: SignedResult,
        reservation: ITransactionReservation,
        passwordProvider?: SecretsProvider,
    ): Promise<IReservedOperationResult> {
        await ReservationAdapter.submissionsGuard.track(
            wallet.getSigner().getId(),
            async () => {
                await this.persistReservation(
                    reservation,
                    wallet,
                    passwordProvider,
                );

                try {
                    await this.submit(signedDeploy);
                } catch (error: unknown) {
                    await this.settleFailedSubmission(reservation, error);

                    throw error;
                }
            },
        );

        this.reservationsManager.add(reservation.id, reservation);

        return {
            deployId: reservation.details.deployId,
            subscribe: (callbacks: IDeployWatchCallbacks) =>
                this.reservationsManager.subscribe(reservation.id, callbacks),
        };
    }

    private static resolveDeployPhlo(
        api: NodeApiAdapter,
        phlo: Pick<TDeployDetails, "phloLimit" | "phloPrice">,
        { context }: IErrorContext,
    ): IDeployPhlo {
        ensureValid(
            validatePhloSettings(phlo, {
                maxPhloPrice: api.getMaxPhloPrice(),
            }),
            { context },
        );

        return createDeployPhlo(phlo);
    }

    public static getTransferGasReserve(
        phlo: Pick<TDeployDetails, "phloLimit" | "phloPrice"> = {},
    ): bigint {
        const api: NodeApiAdapter = NodeApiProvider.getInstance().getApi();

        const { maxPhloCharge }: IDeployPhlo =
            ReservationAdapter.resolveDeployPhlo(api, phlo, {
                context: "ReservationAdapter.getTransferGasReserve",
            });

        return api.getTransferGasReserve(maxPhloCharge);
    }

    public async transfer(
        wallet: Wallet,
        accountId: string,
        details: ITransferDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<IReservedOperationResult> {
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const nativeTokenDecimals: number =
            ApiClientManager.getInstance().getNetwork(networkId).config
                .nativeTokenDecimals;

        const api: NodeApiAdapter = NodeApiProvider.getInstance().getApi();

        const { phloLimit, phloPrice, maxPhloCharge }: IDeployPhlo =
            ReservationAdapter.resolveDeployPhlo(api, details, {
                context: "ReservationAdapter.transfer",
            });

        const transferDetails: ITransferDetails = {
            ...details,
            phloLimit,
            phloPrice,
        };

        const gasCost: bigint = api.getTransferGasReserve(maxPhloCharge);
        const pendingAmount: bigint = transferDetails.amount + gasCost;

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
                                    transferDetails,
                                    passwordProvider,
                                );

                            const reservation: ITransactionReservation =
                                TransactionReservationFabric.createTransfer({
                                    kind: "transfer",
                                    deployId: signedDeploy.signature,
                                    networkId,
                                    nativeTokenDecimals,
                                    account,
                                    pendingAmount,
                                    details: transferDetails,
                                    gasCost,
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

        const nativeTokenDecimals: number =
            ApiClientManager.getInstance().getNetwork(networkId).config
                .nativeTokenDecimals;
        const api: NodeApiAdapter = NodeApiProvider.getInstance().getApi();

        const {
            phloLimit,
            phloPrice,
            maxPhloCharge: pendingAmount,
        }: IDeployPhlo = ReservationAdapter.resolveDeployPhlo(api, details, {
            context: "ReservationAdapter.deploy",
        });

        const deployDetails: TDeployDetails = {
            ...details,
            phloLimit,
            phloPrice,
        };

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
                                    deployDetails,
                                    passwordProvider,
                                );

                            const reservation: ITransactionReservation =
                                TransactionReservationFabric.createDeploy({
                                    kind: "deploy",
                                    deployId: signedDeploy.signature,
                                    networkId,
                                    nativeTokenDecimals,
                                    account,
                                    pendingAmount,
                                    term: deployDetails.term,
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
