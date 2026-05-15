import { ReactElement } from "react";
import { ViewReservation } from "../../../sdk-react-kit/hooks/reservationSlice";

interface ItemProps {
    reservation: ViewReservation;
}

export const Item = ({reservation}: ItemProps): ReactElement => {
    return (
        <tr>
            <td>
                {reservation.amount}
            </td>
            <td>
                {reservation.status}
            </td>
            <td>
                {reservation.deployId}
            </td>
        </tr>
    )
}