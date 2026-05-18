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
    ); //INFO/TODO: use reservations from sdk
    
    const {sdkClient} = useSdkContext();
    // (async() => {
    //     const reservations = await sdkClient.getReservationsByTxs(address);
    //     console.log("sdk reservations:", reservations);
    // })(); 

    useEffect(() => { //INFO/TODO: move balance and reservations for wallet to hook 
        const updateReservationStatus = async () => {
            // const reservationService = FundsReservationService.getInstance();
            // const totalReserved = reservationService.getTotalReserved(address); //INFO/TODO: move method to domain layer. Access though application layer
            // const availableBalance = balance - totalReserved; //INFO/TODO: move method to domain layer. Access though application layer
            // const allReservations = reservationService.getReservations(address); //INFO/TODO: use getReservationsByTxs instead  
            // const pendingDeployCount = pendingDeploys ? pendingDeploys.size : 0; //INFO/TODO: use local txs from auxiliary vault as source for reservations

            const reservations = await sdkClient.getReservationsByTxs(address); //INFO/TODO: use it for reservations
            const allReservations = reservations.map(reservationRecord => reservationRecord.toObject());
            const pendingDeployCount = reservations.length;
            const availableBalance = Amount.getAvailableBalance(balance, reservations);
            const totalReserved = Reservation.getTotalReserved(reservations);

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
