import { ReactElement } from "react";
import { useSdkContext } from "../../../sdk-react-kit";
import { Item } from "./Item";
import { ViewReservation } from "../../../sdk-react-kit/hooks/reservationSlice";

const reservationListContent = (reservations: ViewReservation[] | null): ReactElement => {
    if(!reservations) {
        return <>N/A</>;
    }
    if(!reservations.length) {
        return <>Empty reservations list</>;
    }
    return  (
        <table className="table">
            <thead>
                <tr>
                    <th>amount</th>
                    <th>status</th>
                    <th>deployId</th>
                </tr>
            </thead>
            <tbody>
                {reservations.map((reservation) => (
                    <Item key={reservation.deployId} reservation={reservation} />
                ))}
            </tbody>
        </table>
    )
}

export const ReservationList = (): ReactElement => {
    const {reservation} = useSdkContext();
    console.log("ReservationList: reservation=", reservation);
    return (
    <section className="section">
        <h2>ReservationList</h2>
        {reservationListContent(reservation?.reservations)}
    </section>
    )
} 