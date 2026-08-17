import ReservationAdapter from "@domains/ReservationAdapter";
import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import DisposableItemManager from "@services/DisposableItemManager";
import { NetworkId } from "@domains/Network";
import { TReservationsByWallet } from "@domains/Transaction";

export interface ICreateReservationAdapterManagerOptions {
    onReservationsChanged?: () => void;
    reservationAdapters?: Map<string, ReservationAdapter>;
}

class ReservationAdapterManager extends DisposableItemManager<ReservationAdapter> {
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

    public hasNetworkReservations(networkId: NetworkId): boolean {
        return this.getAll().some((reservationAdapter: ReservationAdapter) =>
            reservationAdapter.hasNetworkReservations(networkId),
        );
    }

    public async removeNetworkReservations(
        networkId: NetworkId,
    ): Promise<void> {
        try {
            await Promise.all(
                this.getAll().map((reservationAdapter: ReservationAdapter) =>
                    reservationAdapter.removeNetworkReservations(networkId),
                ),
            );
        } finally {
            this.notifyReservationsChanged();
        }
    }
}

export default ReservationAdapterManager;
