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
import { NetworkName } from "@domains/Network";
import ApiClientManager from "@domains/ApiClientManager";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import CryptoService, { EncryptedData } from "@services/Crypto";
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
        passwordProvider: SecretsProvider,
        reservationsManagerOptions?: Omit<
            ITransactionReservationsManagerOptions,
            "onConfirmed" | "onExpired"
        >,
    ): Promise<ReservationAdapter> {
        const networkName: NetworkName =
            ApiClientManager.getInstance().getNetwork();
        const signerId: string = wallet.getSigner().getId();

        const records: ITransactionReservationsStorageRecord[] =
            await StorageManager.getTransactionReservationsBySignerId(
                signerId,
                networkName,
            );

        const password: string = passwordProvider.getSecret().password;

        const reservations: ITransactionReservation[] = [];

        for (const record of records) {
            const decrypted: string = await CryptoService.decryptWithPassword(
                record.encryptedData,
                password,
            );

            const privateData: ITransactionReservationPrivateData =
                JSON.parse(decrypted);

            if (privateData.expirationTime <= Date.now()) {
                await StorageManager.deleteTransactionReservation(record.id);

                continue;
            }

            reservations.push({
                id: record.id,
                networkName: record.networkName,
                timestamp: new Date(privateData.timestamp),
                accountAddress: privateData.accountAddress,
                pendingAmount: privateData.pendingAmount,
                deployId: privateData.deployId,
                expirationTime: privateData.expirationTime,
            });
        }

        return new ReservationAdapter(reservations, reservationsManagerOptions);
    }

    private getReservedAmount(accountAddress: string): bigint {
        const reservations: ITransactionReservation[] =
            this.reservationsManager.getByAccountAddress(accountAddress);

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

        const reserved: bigint = this.getReservedAmount(account.getAddress());

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
        passwordProvider: SecretsProvider,
    ): Promise<void> {
        const password: string = passwordProvider.getSecret().password;

        const privateData: ITransactionReservationPrivateData = {
            timestamp: reservation.timestamp,
            accountAddress: reservation.accountAddress,
            pendingAmount: reservation.pendingAmount,
            deployId: reservation.deployId,
            expirationTime: reservation.expirationTime,
        };

        const encryptedData: EncryptedData =
            await CryptoService.encryptWithPassword(
                JSON.stringify(privateData),
                password,
            );

        await StorageManager.saveTransactionReservation({
            id: reservation.id,
            networkName: reservation.networkName,
            signerId: wallet.getSigner().getId(),
            encryptedData,
        });
    }

    public async transfer(
        wallet: Wallet,
        details: ITransferDetails,
        passwordProvider: SecretsProvider,
    ): Promise<string> {
        const deployId: string = await wallet.transfer(
            details,
            passwordProvider,
        );

        const account: Account = wallet.getActiveAccount()!;

        const reservation: ITransactionReservation = {
            id: generateRandomId(),
            deployId,
            timestamp: new Date(),
            accountAddress: account.getAddress(),
            pendingAmount: details.amount.toString(),
            networkName: ApiClientManager.getInstance().getNetwork(),
            expirationTime: Date.now() + RESERVATION_EXPIRATION_TIME,
        };

        await this.persistReservation(reservation, wallet, passwordProvider);

        this.reservationsManager.add(reservation);

        return deployId;
    }
}
