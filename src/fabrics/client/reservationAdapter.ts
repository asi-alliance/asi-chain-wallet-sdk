import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import ReservationAdapter from "@domains/ReservationAdapter";
import ReservationAdapterManager from "@services/ReservationAdapterManager";
import ClientEventBus, { ClientEvent } from "@services/ClientEventBus";

export interface IAddReservationAdapterToManagerOptions {
    reservationAdapterManager: ReservationAdapterManager;
    wallet: Wallet;
    passwordProvider: SecretsProvider;
    eventBus: ClientEventBus;
}

export const createReservationAdapter = async ({
    reservationAdapterManager,
    wallet,
    passwordProvider,
    eventBus,
}: IAddReservationAdapterToManagerOptions): Promise<ReservationAdapter> => {
    const emitReservationsChanged = (): void => {
        eventBus.emit(
            ClientEvent.RESERVATIONS_CHANGED,
            reservationAdapterManager.getReservationsByWallet(),
        );
    };

    return reservationAdapterManager.create(wallet, passwordProvider, {
        onAdded: emitReservationsChanged,
        onConfirmed: emitReservationsChanged,
        onExpired: emitReservationsChanged,
        onFailed: emitReservationsChanged,
    });
};