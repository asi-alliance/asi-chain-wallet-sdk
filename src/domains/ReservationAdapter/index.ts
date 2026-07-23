import StorageManager from "@services/StorageManager";
import TransactionReservationsManager, {
    ITransactionReservationsManagerOptions,
} from "@services/TransactionReservationsManager";
import {
    ITransactionReservation,
    ITransactionReservationPrivateData,
} from "@domains/Transaction";
import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import { NetworkId } from "@domains/Network";
import ApiClientManager from "@domains/ApiClientManager";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { GasFee, RESERVATION_EXPIRATION_TIME } from "@config/index";
import { IBalanceData } from "@services/AssetsService";
import Account from "@domains/Account";
import { ITransferDetails } from "@services/TransactionService";
import { generateRandomId } from "@utils/index";

export default class ReservationAdapter {
    private readonly reservationsManager: TransactionReservationsManager;

    constructor(
        reservations: ITransactionReservation[],
        reservationsManagerOptions?: Omit<
            ITransactionReservationsManagerOptions,
            "onConfirmed" | "onExpired"
        >,
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
                onConfirmed: releaseFromStorage,
                onExpired: releaseFromStorage,
                ...reservationsManagerOptions,
            },
        );
    }

    public static async create(
        wallet: Wallet,
        reservationsManagerOptions?: Omit<
            ITransactionReservationsManagerOptions,
            "onConfirmed" | "onExpired"
        >,
    ): Promise<ReservationAdapter> {
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();
        const signerId: string = wallet.getSigner().getId();

        const records: ITransactionReservationsStorageRecord[] =
            await StorageManager.getTransactionReservationsBySignerId(
                signerId,
                networkId,
            );

        const reservations: ITransactionReservation[] = [];

        for (const record of records) {
            const { privateData } = record;

            if (privateData.expirationTime <= Date.now()) {
                await StorageManager.deleteTransactionReservation(record.id);

                continue;
            }

            reservations.push({
                id: record.id,
                networkId: record.networkId,
                timestamp: new Date(privateData.timestamp),
                accountId: privateData.accountId,
                pendingAmount: privateData.pendingAmount,
                deployId: privateData.deployId,
                expirationTime: privateData.expirationTime,
            });
        }

        return new ReservationAdapter(reservations, reservationsManagerOptions);
    }

    private getReservedAmount(accountId: string): bigint {
        const reservations: ITransactionReservation[] =
            this.reservationsManager.getByAccountId(accountId);

        const totalAmount: bigint = reservations.reduce(
            (sum: bigint, reservation: ITransactionReservation) =>
                sum + BigInt(reservation.pendingAmount),
            0n,
        );

        const totalFee: bigint = BigInt(reservations.length) * GasFee.MAX;

        return totalAmount + totalFee;
    }

    public async getBalance(account: Account): Promise<IBalanceData> {
        const balance: IBalanceData = await account.getBalance();

        const reserved: bigint = this.getReservedAmount(account.getId());

        return {
            ...balance,
            amount: balance.amount - reserved,
        };
    }

    public getReservations(): ITransactionReservation[] {
        return this.reservationsManager.getAll();
    }

    public dispose(): void {
        this.reservationsManager.dispose();
    }

    private async persistReservation(
        reservation: ITransactionReservation,
        wallet: Wallet,
    ): Promise<void> {
        const privateData: ITransactionReservationPrivateData = {
            timestamp: reservation.timestamp,
            accountId: reservation.accountId,
            pendingAmount: reservation.pendingAmount,
            deployId: reservation.deployId,
            expirationTime: reservation.expirationTime,
        };

        await StorageManager.saveTransactionReservation({
            id: reservation.id,
            networkId: reservation.networkId,
            signerId: wallet.getSigner().getId(),
            privateData,
        });
    }

    public async validateSufficientBalance(
        account: Account,
        amount: bigint,
    ): Promise<boolean> {
        const totalReservedAmount: bigint =
            this.getReservedAmount(account.getId()) + amount;
        const remoteBalance: bigint = (await account.getBalance()).amount;

        return remoteBalance - totalReservedAmount > 0n;
    }

    public async transfer(
        wallet: Wallet,
        details: ITransferDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<string> {
        const account: Account = wallet.getActiveAccount()!;

        const isSufficientBalance: boolean =
            await this.validateSufficientBalance(account, details.amount);

        if (!isSufficientBalance) {
            throw new Error(
                "ReservationAdapter.transfer: Insufficient balance",
            );
        }

        const deployId: string = await wallet.transfer(
            details,
            passwordProvider,
        );

        const reservation: ITransactionReservation = {
            id: generateRandomId(),
            deployId,
            timestamp: new Date(),
            accountId: account.getId(),
            pendingAmount: details.amount.toString(),
            networkId: ApiClientManager.getInstance().getCurrentNetworkId(),
            expirationTime: Date.now() + RESERVATION_EXPIRATION_TIME,
        };

        await this.persistReservation(reservation, wallet);

        this.reservationsManager.add(reservation);

        return deployId;
    }
}
