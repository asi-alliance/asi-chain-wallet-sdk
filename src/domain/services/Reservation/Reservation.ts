import ReservationRecord from "@domain/aggregates/Reservation";

export class Reservation {
    public static getTotalReserved(reservations: ReservationRecord[]) {
        const totalReserved = reservations.reduce((accumulator, reservation) => (accumulator+reservation.getAmount()), 0n);
        return totalReserved;
    }
}