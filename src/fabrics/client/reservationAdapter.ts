import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import ReservationAdapter from "@domains/ReservationAdapter";
import ReservationAdapterManager from "@services/ReservationAdapterManager";
import { IClientEventDispatcher } from "@domains/Client";

export interface IAddReservationAdapterToManagerOptions {
    reservationAdapterManager: ReservationAdapterManager;
    wallet: Wallet;
    passwordProvider: SecretsProvider;
    eventDispatcher?: IClientEventDispatcher;
}

export const createReservationAdapter = async ({
    reservationAdapterManager,
    wallet,
    passwordProvider,
    eventDispatcher,
}: IAddReservationAdapterToManagerOptions): Promise<ReservationAdapter> => {
    const emitReservationsChanged = (): void => {
        const reservationAdapter: ReservationAdapter | null =
            reservationAdapterManager.get(wallet.getId());

        if (!reservationAdapter) {
            return;
        }

        eventDispatcher?.onReservationsChanged?.(
            wallet.getId(),
            reservationAdapter.getReservations(),
        );
    };

    return reservationAdapterManager.create(wallet, passwordProvider, {
        onAdded: emitReservationsChanged,
        onConfirmed: emitReservationsChanged,
        onExpired: emitReservationsChanged,
        onFailed: emitReservationsChanged,
    });
};
