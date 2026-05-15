import { Client, Transaction, Reservation, fromAtomicAmount } from "asi-wallet-sdk";
import { useMemo } from "react";

export type ViewReservation = Omit<Reservation, "amount"> & {
    amount: string;
} 

export interface ReservationSlice {
    reservations: ViewReservation[];
}

export const reservationSlice = (sdkClient: Client, transactions: Transaction[]): ReservationSlice => {
    const reservations: ViewReservation[] = useMemo(() => {
        if(!sdkClient || !transactions) {
            return null;
        }
        return sdkClient.fundsReservation.getReservationsByTxs(transactions).map(reservationRecord => {
            const reservation = reservationRecord.toObject();
            reservation.amount = fromAtomicAmount(reservation.amount) as unknown as bigint;
            return reservation as unknown as ViewReservation;
        })
    },
    [sdkClient,transactions]
    );
    const reservationSliceValue: ReservationSlice = useMemo(() => ({
        reservations: reservations
    }), [reservations]);

    return reservationSliceValue;
}