import { useCallback, useEffect, useMemo, useState } from "react";
import type { UseSdkValue } from "./useSdk";

export interface WalletBalance {
    total: bigint | null;
    available: bigint | null;
    reservationCount: number | null;
}
export interface ILoadingBalanceOptions {
    reloadIntervalMs?: number;
}

export interface UseWalletBalanceValue {
    balance: WalletBalance;
    isFetching: boolean;
    reload: () => Promise<void>;
}

const DEFAULT_RELOAD_INTERVAL_MS: number = 30000;

export const useWalletBalance = (
    sdk: UseSdkValue,
    walletId: string,
    accountId: string,
    address: string,
    options?: ILoadingBalanceOptions,
): UseWalletBalanceValue => {
    const [balance, setBalance] = useState<WalletBalance>({
        total: null,
        available: null,
        reservationCount: null,
    });
    const [isFetching, setIsFetching] = useState<boolean>(false);

    const reload = useCallback(async (): Promise<void> => {
        setIsFetching(true);

        try {
            const total = await sdk.getBalance(address);
            const available = await sdk.getAvailableBalance(
                walletId,
                accountId,
            );
            const reservations = await sdk.getReservations(walletId);

            setBalance({
                total,
                available,
                reservationCount: reservations.length,
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsFetching(false);
        }
    }, [sdk, walletId, accountId, address]);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        setInterval(() => {
            reload();
        }, options?.reloadIntervalMs ?? DEFAULT_RELOAD_INTERVAL_MS);
    }, [reload]);

    return useMemo(
        () => ({ balance, isFetching, reload }),
        [balance, isFetching, reload],
    );
};
