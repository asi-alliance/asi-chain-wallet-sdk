import { useCallback, useEffect, useMemo, useState } from "react";
import type {
    Address,
    ITransactionReservation,
    NetworkId,
} from "asi-wallet-sdk";
import type { UseSdkValue } from "./useSdk";
import { toErrorText } from "../errors";
import {
    useRelevantResultGuard,
    type TIsResultRelevant,
    type TStartRequest,
} from "./useRelevantResultGuard";

export interface WalletBalance {
    total: bigint | null;
    available: bigint | null;
}
export interface ILoadingBalanceOptions {
    reloadIntervalMs?: number;
}

export interface UseWalletBalanceValue {
    balance: WalletBalance;
    reservationCount: number;
    isFetching: boolean;
    error: string | null;
    reload: () => Promise<void>;
}

const DEFAULT_RELOAD_INTERVAL_MS: number = 30000;

const UNKNOWN_BALANCE: WalletBalance = {
    total: null,
    available: null,
};

export const useWalletBalance = (
    sdk: UseSdkValue,
    walletId: string,
    accountId: string,
    address: Address,
    options?: ILoadingBalanceOptions,
): UseWalletBalanceValue => {
    const {
        getBalance,
        getAvailableBalance,
        reservationsByWallet,
        currentNetwork,
    } = sdk;

    const networkId: NetworkId | undefined = currentNetwork?.id;

    const reservationCount: number = useMemo(
        () =>
            (reservationsByWallet[walletId] ?? []).filter(
                (reservation: ITransactionReservation) =>
                    reservation.accountId === accountId,
            ).length,
        [reservationsByWallet, walletId, accountId],
    );

    const [balance, setBalance] = useState<WalletBalance>(UNKNOWN_BALANCE);
    const [isFetching, setIsFetching] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const startRequest: TStartRequest = useRelevantResultGuard(networkId);

    const reload = useCallback(async (): Promise<void> => {
        const isResultRelevant: TIsResultRelevant = startRequest();

        setIsFetching(true);

        try {
            const total = await getBalance(address);
            const available = await getAvailableBalance(walletId, accountId);

            if (!isResultRelevant()) {
                return;
            }

            setBalance({ total, available });
            setError(null);
        } catch (balanceError) {
            console.error(balanceError);

            if (!isResultRelevant()) {
                return;
            }

            setBalance(UNKNOWN_BALANCE);
            setError(
                toErrorText(balanceError, "Balance is unavailable"),
            );
        } finally {
            setIsFetching(false);
        }
    }, [
        startRequest,
        getBalance,
        getAvailableBalance,
        walletId,
        accountId,
        address,
    ]);

    useEffect(() => {
        void reload();
    }, [reload, networkId, reservationCount]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            void reload();
        }, options?.reloadIntervalMs ?? DEFAULT_RELOAD_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [reload, options?.reloadIntervalMs]);

    return useMemo(
        () => ({ balance, reservationCount, isFetching, error, reload }),
        [balance, reservationCount, isFetching, error, reload],
    );
};
