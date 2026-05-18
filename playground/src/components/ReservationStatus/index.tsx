import {
    Address,
    Amount,
    FundsReservationService,
    Reservation,
    fromAtomicAmount,
} from "asi-wallet-sdk";
import { useEffect, useState, type ReactElement } from "react";
import "./style.css";
import { useSdkContext } from "../../sdk-react-kit";
import { WalletBalance } from "../../sdk-react-kit/hooks/useWalletBalance";

export interface IReservationStatusProps {
    address: Address;
    balance: bigint;
    isBalanceFetching?: boolean;
    pendingDeploys?: Map<
        string,
        { amount: bigint; timestamp: number; toAddress: string }
    >;
    walletBalance: WalletBalance;
}

interface ReservationInfo {
    totalReserved: bigint;
    availableBalance: bigint;
    reservationCount: number;
}

const ReservationStatus = ({
    address,
    balance,
    isBalanceFetching = false,
    walletBalance,
}: IReservationStatusProps): ReactElement => {

    if (!walletBalance) {
        return <div className="reservation-status loading">Loading...</div>;
    }

    const hasReservations = Boolean(walletBalance.walletBalance.reservationCount);

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
                            : `${fromAtomicAmount(balance ?? 0n)} ASI`}
                    </span>
                </div>

                {hasReservations && (
                    <>
                        <div className="reservation-status__item">
                            <span className="reservation-status__label">
                                Reserved:
                            </span>
                            <span className="reservation-status__value reserved">
                                {fromAtomicAmount(walletBalance.walletBalance.totalReserved)}{" "}
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
                        {fromAtomicAmount(walletBalance.walletBalance.availableBalance ?? 0n)} ASI
                    </span>
                </div>

                {hasReservations && (
                    <div className="reservation-status__item">
                        <span className="reservation-status__label">
                            Active Transfers:
                        </span>
                        <span className="reservation-status__value">
                            {walletBalance.walletBalance.reservationCount}
                        </span>
                    </div>
                )}
            </div>

            {hasReservations && (
                <div className="reservation-status__info">
                    <p>
                        {walletBalance.walletBalance.reservationCount} active transfer
                        {walletBalance.walletBalance.reservationCount !== 1 ? "s" : ""}
                        {walletBalance.walletBalance.reservationCount > 0
                            ? " in progress. Reserved funds will be freed once confirmed."
                            : ""}
                    </p>
                </div>
            )}
        </div>
    );
};

export default ReservationStatus;
