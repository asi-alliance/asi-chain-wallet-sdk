import {
    Address,
    FundsReservationService,
    fromAtomicAmount,
} from "asi-wallet-sdk";
import { useEffect, useState, type ReactElement } from "react";
import "./style.css";

export interface IReservationStatusProps {
    address: Address;
    balance: bigint;
    isBalanceFetching?: boolean;
    pendingDeploys?: Map<
        string,
        { amount: bigint; timestamp: number; toAddress: string }
    >;
}

interface ReservationInfo {
    totalReserved: bigint;
    availableBalance: bigint;
    reservationCount: number;
    pendingDeployCount: number;
}

const ReservationStatus = ({
    address,
    balance,
    isBalanceFetching = false,
    pendingDeploys,
}: IReservationStatusProps): ReactElement => {
    const [reservations, setReservations] = useState<ReservationInfo | null>(
        null,
    );

    useEffect(() => {
        const updateReservationStatus = () => {
            console.log("Balance");
            const reservationService = FundsReservationService.getInstance();
            const totalReserved = reservationService.getTotalReserved(address);
            const availableBalance = balance - totalReserved;
            const allReservations = reservationService.getReservations(address);
            const pendingDeployCount = pendingDeploys ? pendingDeploys.size : 0;

            setReservations({
                totalReserved,
                availableBalance,
                reservationCount: allReservations.length,
                pendingDeployCount,
            });
        };

        updateReservationStatus();
    }, [address, balance, pendingDeploys]);

    if (!reservations) {
        return <div className="reservation-status loading">Loading...</div>;
    }

    const hasReservations = reservations.totalReserved > 0n;

    return (
        <div
            className={`reservation-status ${isBalanceFetching ? "fetching" : ""}`}
        >
            <div className="reservation-status__header">
                <h4>Reservation Status</h4>
            </div>

            <div className="reservation-status__content">
                <div className="reservation-status__item">
                    <span className="reservation-status__label">Balance:</span>
                    <span className="reservation-status__value">
                        {isBalanceFetching
                            ? "updating..."
                            : `${fromAtomicAmount(balance)} ASI`}
                    </span>
                </div>

                {hasReservations && (
                    <>
                        <div className="reservation-status__item">
                            <span className="reservation-status__label">
                                Reserved:
                            </span>
                            <span className="reservation-status__value reserved">
                                {fromAtomicAmount(reservations.totalReserved)}{" "}
                                ASI
                            </span>
                        </div>
                    </>
                )}

                <div className="reservation-status__item available">
                    <span className="reservation-status__label">
                        Available:
                    </span>
                    <span className="reservation-status__value">
                        {fromAtomicAmount(reservations.availableBalance)} ASI
                    </span>
                </div>

                {hasReservations && (
                    <div className="reservation-status__item">
                        <span className="reservation-status__label">
                            Active Transfers:
                        </span>
                        <span className="reservation-status__value">
                            {reservations.pendingDeployCount}
                        </span>
                    </div>
                )}
            </div>

            {hasReservations && (
                <div className="reservation-status__info">
                    <p>
                        {reservations.pendingDeployCount} active transfer
                        {reservations.pendingDeployCount !== 1 ? "s" : ""}
                        {reservations.pendingDeployCount > 0
                            ? " in progress. Reserved funds will be freed once confirmed."
                            : ""}
                    </p>
                </div>
            )}
        </div>
    );
};

export default ReservationStatus;
