import ReservationAdapter from "@domains/ReservationAdapter";
import Wallet, { Address } from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import DisposableItemManager from "@services/DisposableItemManager";
import { NetworkId } from "@domains/Network";
import {
    ITransactionReservation,
    Transaction,
    TReservationsByWallet,
} from "@domains/Transaction";
import Account from "@domains/Account";
import TransactionReservationFabric from "@fabrics/transactionReservation";
import { isSameAddress } from "@utils/index";
import { ReservationAction } from "@domains/CustomError";
import ReservationOperationGuardService from "@services/ReservationOperationGuard";

export interface ICreateReservationAdapterManagerOptions {
    onReservationsChanged?: () => void;
    reservationAdapters?: Map<string, ReservationAdapter>;
}

class ReservationAdapterManager extends DisposableItemManager<ReservationAdapter> {
    private static readonly operationsGuard: ReservationOperationGuardService =
        ReservationOperationGuardService.getInstance();

    private readonly onReservationsChanged: (() => void) | null;

    constructor({
        reservationAdapters,
        onReservationsChanged,
    }: ICreateReservationAdapterManagerOptions) {
        super(reservationAdapters);

        this.onReservationsChanged = onReservationsChanged ?? null;
    }

    private readonly notifyReservationsChanged = (): void => {
        this.onReservationsChanged?.();
    };

    public async create(
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
    ): Promise<ReservationAdapter> {
        const reservationAdapter: ReservationAdapter =
            await ReservationAdapter.create(wallet, passwordProvider, {
                onAdded: this.notifyReservationsChanged,
                onReplaced: this.notifyReservationsChanged,
                onRemoved: this.notifyReservationsChanged,
                onConfirmed: this.notifyReservationsChanged,
                onExpired: this.notifyReservationsChanged,
            });

        super.add(wallet.getId(), reservationAdapter);

        this.notifyReservationsChanged();

        return reservationAdapter;
    }

    public remove(id: string): ReservationAdapter {
        const removedAdapter: ReservationAdapter = super.remove(id);

        this.notifyReservationsChanged();

        return removedAdapter;
    }

    public removeByFilter(
        filter: (reservationAdapter: ReservationAdapter) => boolean,
    ): ReservationAdapter[] {
        const removedAdapters: ReservationAdapter[] = super.removeByFilter(
            filter,
        );

        this.notifyReservationsChanged();

        return removedAdapters;
    }

    public clear(): void {
        super.clear();

        this.notifyReservationsChanged();
    }

    public getReservationsByWallet(): TReservationsByWallet {
        const reservationsByWallet: TReservationsByWallet = {};

        for (const [walletId, reservationAdapter] of this.getMap()) {
            reservationsByWallet[walletId] =
                reservationAdapter.getReservations();
        }

        return reservationsByWallet;
    }

    public getAllReservations(): ITransactionReservation[] {
        return this.getAll().flatMap((adapter: ReservationAdapter) =>
            adapter.getReservations(),
        );
    }

    public getIncomingReservations(
        targetAddress: Address,
    ): ITransactionReservation[] {
        return this.getAllReservations().filter(
            (reservation: ITransactionReservation) =>
                reservation.kind === "transfer" &&
                isSameAddress(reservation.details.to, targetAddress) &&
                !isSameAddress(
                    reservation.details.from,
                    reservation.details.to,
                ),
        );
    }

    public hasNetworkReservations(networkId: NetworkId): boolean {
        return this.getAll().some((reservationAdapter: ReservationAdapter) =>
            reservationAdapter.hasNetworkReservations(networkId),
        );
    }

    public async removeNetworkReservations(
        networkId: NetworkId,
    ): Promise<void> {
        return ReservationAdapterManager.operationsGuard.runNetworkReservationAction(
            ReservationAction.NETWORK_CLEANUP,
            networkId,
            async () => {
                try {
                    await Promise.all(
                        this.getAll().map(
                            (reservationAdapter: ReservationAdapter) =>
                                reservationAdapter.removeNetworkReservations(
                                    networkId,
                                ),
                        ),
                    );
                } finally {
                    this.notifyReservationsChanged();
                }
            },
        );
    }

    public getPendingTransactions(
        walletId: string,
        account: Account,
    ): Transaction[] {
        const reservationAdapter: ReservationAdapter | null =
            this.get(walletId);

        const outgoingPendingTransactions: Transaction[] = reservationAdapter
            ? reservationAdapter.getOutgoingPendingTransactions(account)
            : [];
        const incomingPendingTransactions: Transaction[] =
            this.getIncomingReservations(account.getAddress()).map(
                (reservation: ITransactionReservation) =>
                    TransactionReservationFabric.toPendingTransaction(
                        reservation,
                        account.getAddress(),
                    ),
            );

        return [...incomingPendingTransactions, ...outgoingPendingTransactions];
    }
}

export default ReservationAdapterManager;
