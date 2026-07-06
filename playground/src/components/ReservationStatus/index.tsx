import { type ReactElement } from "react";
import "./style.css";
import { formatAmount } from "../../sdk-react-kit";
import type { WalletBalance } from "../../sdk-react-kit/hooks/useWalletBalance";

export interface IReservationStatusProps {
    balance: WalletBalance;
    isFetching?: boolean;
}

const ReservationStatus = ({
    balance,
    isFetching = false,
}: IReservationStatusProps): ReactElement => {
    const totalReserved =
        balance.total !== null && balance.available !== null
            ? balance.total - balance.available
            : null;

    const hasReservations = Boolean(balance.reservationCount);

    return (
        <div
            className={`reservation-status ${isFetching ? "fetching" : ""}`}
        >
            <div className="reservation-status__header">
                <h4>Reservation Status</h4>
            </div>

            <div className="reservation-status__content">
                <div className="reservation-status__item">
                    <span className="reservation-status__label">Balance:</span>
                    <span className="reservation-status__value">
                        {isFetching
                            ? "updating..."
                            : `${formatAmount(balance.total)} ASI`}
                    </span>
                </div>

                {hasReservations && (
                    <div className="reservation-status__item">
                        <span className="reservation-status__label">
                            Reserved:
                        </span>
                        <span className="reservation-status__value reserved">
                            {formatAmount(totalReserved)} ASI
                        </span>
                    </div>
                )}

                <div className="reservation-status__item available">
                    <span className="reservation-status__label">
                        Available:
                    </span>
                    <span className="reservation-status__value">
                        {formatAmount(balance.available)} ASI
                    </span>
                </div>

                {hasReservations && (
                    <div className="reservation-status__item">
                        <span className="reservation-status__label">
                            Active Transfers:
                        </span>
                        <span className="reservation-status__value">
                            {balance.reservationCount}
                        </span>
                    </div>
                )}
            </div>

            {hasReservations && (
                <div className="reservation-status__info">
                    <p>
                        {balance.reservationCount} active transfer
                        {balance.reservationCount !== 1 ? "s" : ""} in progress.
                        Reserved funds will be freed once confirmed.
                    </p>
                </div>
            )}
        </div>
    );
};

export default ReservationStatus;