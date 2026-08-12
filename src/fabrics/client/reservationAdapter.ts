import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import ReservationAdapter from "@domains/ReservationAdapter";
import ReservationAdapterManager from "@services/ReservationAdapterManager";
import ClientEventBus, { ClientEvent } from "@services/ClientEventBus";

export interface IAddReservationAdapterToManagerOptions {
    reservationAdapterManager: ReservationAdapterManager;
    wallet: Wallet;
    passwordProvider: SecretsProvider;
    emitReservationsChanged: () => void;
}

export const createReservationAdapter = async ({
    reservationAdapterManager,
    wallet,
    passwordProvider,
    emitReservationsChanged,
}: IAddReservationAdapterToManagerOptions): Promise<ReservationAdapter> => {
    return reservationAdapterManager.create(wallet, passwordProvider, {
        onAdded: emitReservationsChanged,
        onConfirmed: emitReservationsChanged,
        onExpired: emitReservationsChanged,
        onFailed: emitReservationsChanged,
    });
};
