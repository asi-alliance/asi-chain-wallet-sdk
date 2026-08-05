import { useCallback, useEffect, useMemo, useState } from "react";
import type { NetworkId } from "asi-wallet-sdk";
import type { UseSdkValue } from "./useSdk";
import {
    useRelevantResultGuard,
    type TIsResultRelevant,
    type TStartRequest,
} from "./useRelevantResultGuard";

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
    const { getBalance, getAvailableBalance, getReservations, currentNetwork } =
        sdk;

    const networkId: NetworkId | undefined = currentNetwork?.id;

    const [balance, setBalance] = useState<WalletBalance>({
        total: null,
        available: null,
        reservationCount: null,
    });
    const [isFetching, setIsFetching] = useState<boolean>(false);

    const startRequest: TStartRequest = useRelevantResultGuard(networkId);

    const reload = useCallback(async (): Promise<void> => {
        const isResultRelevant: TIsResultRelevant = startRequest();

        setIsFetching(true);

        try {
            const total = await getBalance(address);
            const available = await getAvailableBalance(walletId, accountId);
            const reservations = await getReservations(walletId);

            if (!isResultRelevant()) {
                return;
            }

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
    }, [
        startRequest,
        getBalance,
        getAvailableBalance,
        getReservations,
        walletId,
        accountId,
        address,
    ]);

    useEffect(() => {
        void reload();
    }, [reload, networkId]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            void reload();
        }, options?.reloadIntervalMs ?? DEFAULT_RELOAD_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [reload, options?.reloadIntervalMs]);

    return useMemo(
        () => ({ balance, isFetching, reload }),
        [balance, isFetching, reload],
    );
};
