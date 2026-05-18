import { useCallback, useEffect, useState } from "react";
import { Amount, Reservation } from "asi-wallet-sdk";

const AUTO_UPDATE_INTERVAL = 10000; // 10 seconds

type WalletBalance = {
    totalBalance: bigint;
    totalReserved: bigint;
    availableBalance: bigint;
    reservationCount: number;
}

export const useWalletBalance = (sdkClient, address) => {
    const [walletBalance, setWalletBalance] = useState<WalletBalance>({
        totalBalance: null,
        totalReserved: null,
        availableBalance: null,
        reservationCount: null
    });

    const updateReservationStatus = useCallback(async () => {
        const balance = await sdkClient.getASIBalance(address);
        const reservations = await sdkClient.getReservationsByTxs(address); //INFO/TODO: use it for reservations
        const allReservations = reservations.map(reservationRecord => reservationRecord.toObject());
        const availableBalance = Amount.getAvailableBalance(balance, reservations);
        const totalReserved = Reservation.getTotalReserved(reservations);

        setWalletBalance({
            totalBalance: balance,
            totalReserved,
            availableBalance,
            reservationCount: allReservations.length,
        });
    }, [sdkClient, address]);


    useEffect(() => {
        updateReservationStatus();
    }, [updateReservationStatus]);

    useEffect(() => {
        const interval = setInterval(() => {
            updateReservationStatus();
        }, AUTO_UPDATE_INTERVAL);
        return () => clearInterval(interval);
    }, [updateReservationStatus]); 

    return walletBalance;
}