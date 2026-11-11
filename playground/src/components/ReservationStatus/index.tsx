import { type ReactElement } from "react";
import type { Asset } from "asi-wallet-sdk";
import { formatAssetAmount } from "../../sdk-react-kit";
import type { WalletBalance } from "../../sdk-react-kit/hooks/useWalletBalance";

export interface IReservationStatusProps {
    balance: WalletBalance;
    reservationCount: number;
    asset: Asset;
    isFetching?: boolean;
    error?: string | null;
}

const getAmountLabel = (
    amount: bigint | null,
    asset: Asset,
    error?: string | null,
): string => {
    if (error) {
        return "unavailable";
    }

    return formatAssetAmount(amount, asset);
};

const ReservationStatus = ({
    balance,
    reservationCount,
    asset,
    isFetching = false,
    error = null,
}: IReservationStatusProps): ReactElement => {
    const totalReserved =
        balance.total !== null && balance.available !== null
            ? balance.total - balance.available
            : null;

    const hasReservations = reservationCount > 0;

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
                            : getAmountLabel(balance.total, asset, error)}
                    </span>
                </div>

                {hasReservations && (
                    <div className="reservation-status__item">
                        <span className="reservation-status__label">
                            Reserved:
                        </span>
                        <span className="reservation-status__value reserved">
                            {formatAssetAmount(totalReserved, asset)}
                        </span>
                    </div>
                )}

                <div className="reservation-status__item available">
                    <span className="reservation-status__label">
                        Available:
                    </span>
                    <span className="reservation-status__value">
                        {getAmountLabel(balance.available, asset, error)}
                    </span>
                </div>

                {hasReservations && (
                    <div className="reservation-status__item">
                        <span className="reservation-status__label">
                            Active reservations:
                        </span>
                        <span className="reservation-status__value">
                            {reservationCount}
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
                        {reservationCount} reservation
                        {reservationCount !== 1 ? "s" : ""} in progress, both
                        transfers and deploys. Reserved funds will be freed once
                        confirmed or expired.
                    </p>
                </div>
            )}
        </div>
    );
};

export default ReservationStatus;