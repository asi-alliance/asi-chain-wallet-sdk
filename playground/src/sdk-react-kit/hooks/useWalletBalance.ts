import { useCallback, useEffect, useMemo, useState } from "react";
import { Amount, ReservationDomainService } from "asi-wallet-sdk";

const AUTO_UPDATE_INTERVAL = 10000; // 10 seconds

export type WalletBalance = {
    walletBalance: {
        totalBalance: bigint;
        totalReserved: bigint;
        availableBalance: bigint;
        reservationCount: number;
    },
    updateReservationStatus: any;
}

export const useWalletBalance = (sdkClient, network, address) => {
    const [walletBalance, setWalletBalance] = useState<WalletBalance["walletBalance"]>({
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
        const totalReserved = ReservationDomainService.getTotalReserved(reservations);

        setWalletBalance({
            totalBalance: balance,
            totalReserved,
            availableBalance,
            reservationCount: allReservations.length,
        });
    }, [sdkClient, address]);

    useEffect(() => {
        updateReservationStatus();
    }, [updateReservationStatus, network]);

    useEffect(() => {
        const interval = setInterval(() => {
            updateReservationStatus();
        }, AUTO_UPDATE_INTERVAL);
        return () => clearInterval(interval);
    }, [updateReservationStatus, network]); 

    const value = useMemo(() => ({
        walletBalance,
        updateReservationStatus
    }), [walletBalance, updateReservationStatus]); 

    return value;
}