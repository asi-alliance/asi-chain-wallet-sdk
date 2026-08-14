import { type ReactElement } from "react";
import "./style.css";
import { formatAmount } from "../../sdk-react-kit";
import type { WalletBalance } from "../../sdk-react-kit/hooks/useWalletBalance";

export interface IReservationStatusProps {
    balance: WalletBalance;
    isFetching?: boolean;
    error?: string | null;
}

const getAmountLabel = (
    amount: bigint | null,
    error?: string | null,
): string => {
    if (error) {
        return "unavailable";
    }

    return `${formatAmount(amount)} ASI`;
};

const ReservationStatus = ({
    balance,
    isFetching = false,
    error = null,
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
                            : getAmountLabel(balance.total, error)}
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
                        {getAmountLabel(balance.available, error)}
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

            {error && (
                <div className="reservation-status__info">
                    <p>Balance unavailable: {error}</p>
                </div>
            )}

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