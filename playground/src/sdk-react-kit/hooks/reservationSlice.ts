import { Client, Transaction, Reservation, fromAtomicAmount, Address } from "asi-wallet-sdk";
import { useEffect, useMemo } from "react";

export type ViewReservation = Omit<Reservation, "amount"> & {
    amount: string;
} 

export interface ReservationSlice {
    reservations: ViewReservation[];
}

export const reservationSlice = (sdkClient: Client, address: Address): ReservationSlice => {
    const [reservations, setReservations] = useState<Reservation[]>(null);
    const reservations: ViewReservation[] = useMemo(async () => {
        
        return (await sdkClient.getReservationsByTxs(address)).map(reservationRecord => {
            const reservation = reservationRecord.toObject();
            reservation.amount = fromAtomicAmount(reservation.amount) as unknown as bigint;
            return reservation as unknown as ViewReservation;
        });
    },
    [sdkClient]
    );

    useEffect(() => {
        const obtainReservations = async () => {
            if(!sdkClient || !address) {
                return null;
            }
            const reservationsResult = (await sdkClient.getReservationsByTxs(address)).map(reservationRecord => {
                const reservation = reservationRecord.toObject();
                reservation.amount = fromAtomicAmount(reservation.amount) as unknown as bigint;
                return reservation as unknown as ViewReservation;
            });
            setReservations(reservationsResult);
        }
        obtainReservations();
    }, [sdkClient, address]);

    const reservationSliceValue: ReservationSlice = useMemo(() => ({
        reservations: reservations
    }), [reservations]);

    return reservationSliceValue;
}