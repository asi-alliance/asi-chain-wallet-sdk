import { Client, Transaction, Reservation, fromAtomicAmount, Address, Network, ReservationRecord } from "asi-wallet-sdk";
import { useEffect, useMemo, useState } from "react";

export type ViewReservation = Omit<Reservation, "amount"> & {
    amount: string;
} 

export interface ReservationSlice {
    reservations: ViewReservation[];
    reservationSetters: {
        setReservations: any;
    }
}

function mapReservationsToViewReservations(reservations: ReservationRecord[] | null) {
    if(!reservations){
        return null;
    }
    return reservations.map(reservationRecord => {
        const reservation = reservationRecord.toObject();
        reservation.amount = fromAtomicAmount(reservation.amount) as unknown as bigint;
        return reservation as unknown as ViewReservation;
    });
}

export const reservationSlice = (sdkClient: Client, network: Network, address: Address): ReservationSlice => {
    const [reservations, setReservations] = useState<ViewReservation[]>(null);

    useEffect(() => {
        const obtainReservations = async () => {
            if(!sdkClient || !address) {
                return null;
            }
            const reservationsResult = await sdkClient.getReservationsByTxs(address);
            setReservations(mapReservationsToViewReservations(reservationsResult));
        }
        obtainReservations();
    }, [sdkClient, network, address]);



    const reservationSliceValue: ReservationSlice = useMemo(() => ({
        reservations: reservations,
        reservationSetters: {
            setReservations: (reservations) => setReservations(mapReservationsToViewReservations(reservations)),
        }
    }), [reservations]);

    return reservationSliceValue;
}