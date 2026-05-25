import { ReservationRecord } from "../../../../../../dist";
import { ViewReservation } from "../../reservationSlice";

export function reservationsCallbacks(reservationsSetters) {
    return {
        onReservationsChanged(reservations: ReservationRecord) {
            reservationsSetters.setReservations(reservations);
        }
    }
}