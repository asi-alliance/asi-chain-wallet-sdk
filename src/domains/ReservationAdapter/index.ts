import StorageManager from "@services/StorageManager";
import TransactionReservationsManager, {
    ITransactionReservationsManagerOptions,
} from "@services/TransactionReservationsManager";
import {
    ITransactionReservation,
    ITransactionReservationPrivateData,
    Transaction,
} from "@domains/Transaction";
import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import { NetworkId } from "@domains/Network";
import ApiClientManager from "@domains/ApiClientManager";
import { ITransactionReservationsStorageRecord } from "@domains/TransactionReservationsStorageRepository";
import { GasFee } from "@config/index";
import { IBalanceData } from "@services/AssetsService";
import Account from "@domains/Account";
import { ITransferDetails } from "@services/TransactionService";
import CryptoService, { EncryptedData } from "@services/Crypto";
import TransactionReservationFabric from "@utils/fabrics/transactionReservation";

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
    ): Promise<ITransactionReservationPrivateData> {
        const decrypted: string = await CryptoService.decryptWithPassword(
            record.encryptedData,
            dataKeySecret,
        );

        return JSON.parse(decrypted);
    }

    public static async create(
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
        reservationsManagerOptions?: ITransactionReservationsManagerOptions,
    ): Promise<ReservationAdapter> {
        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();
        const signerId: string = wallet.getSigner().getId();

        const dataKeySecret: string = await wallet
            .getSigner()
            .resolveDataKey(passwordProvider);

        const records: ITransactionReservationsStorageRecord[] =
            await StorageManager.getTransactionReservationsBySignerId(
                signerId,
                networkId,
            );

        const reservations: ITransactionReservation[] = [];

        for (const record of records) {
            const privateData: ITransactionReservationPrivateData =
                await ReservationAdapter.readPrivateData(record, dataKeySecret);

            if (privateData.expirationTime <= Date.now()) {
                await StorageManager.deleteTransactionReservation(record.id);

                continue;
            }

            reservations.push(
                TransactionReservationFabric.fromStorage(record, privateData),
            );
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

    public getPendingTransactions(accountId?: string): Transaction[] {
        const reservations: ITransactionReservation[] = accountId
            ? this.reservationsManager.getByAccountId(accountId)
            : this.reservationsManager.getAll();

        return reservations.map(
            (reservation: ITransactionReservation) => reservation.transaction,
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
        const privateData: ITransactionReservationPrivateData = {
            accountId: reservation.accountId,
            pendingAmount: reservation.pendingAmount,
            expirationTime: reservation.expirationTime,
            transaction: reservation.transaction,
        };

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

        const networkId: NetworkId =
            ApiClientManager.getInstance().getCurrentNetworkId();

        const reservation: ITransactionReservation =
            TransactionReservationFabric.create({
                deployId,
                networkId,
                account,
                details,
            });

        await this.persistReservation(reservation, wallet, passwordProvider);

        this.reservationsManager.add(reservation);

        return deployId;
    }
}
