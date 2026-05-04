import { useCallback, useEffect, useMemo, useState } from "react";
import { Client, Network, Pagination, Transaction, TransactionFilter, TransactionStats, Wallet } from "asi-wallet-sdk";

// interface UseHistoryOptions {
//   autoUpdate: boolean;
//   autoUpdateInterval: number; //ms
// }
export interface TxHistory {
  stats: TransactionStats;
  transactions: Transaction[];
  loadTransactions: (...args: any) => Promise<any>; //TODO: any
  error: string | null;
  isLoading: boolean;
}

// const defaultUseHistoryOptions: UseHistoryOptions = {
//   autoUpdate: false,
//   autoUpdateInterval: 30000,
// }

export const useTxHistory = (sdkClient: Client, password: string): TxHistory => {
  const [stats, setStats] = useState<TransactionStats>(null);
  const [transactions, setTransactions] = useState<Transaction[]>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);

  // const options = useMemo(() => ({
  //   ...defaultUseHistoryOptions,
  //   ..._options,
  // }), [_options]);


  const loadTransactions = useCallback(async (network: Network, wallet: Wallet, filter: TransactionFilter, pagination: Pagination) => {
    console.log("useTxHistory: loadTransactions: start");
    setIsLoading(true);
    setError(null);
    try {
      // const publicKey = wallet.getPublicKey();
      const {filteredTxs, stats} = await sdkClient.txHistory.getFilteredTxsWithStats(
        network,
        wallet.getAddress(),
        filter,
        pagination,
        password
      );

      setTransactions(filteredTxs);
      setStats(stats);
    } catch (error) {
      console.error(error);
      setError(String(error));
      setTransactions(null);
      setStats(null);
    }
    setIsLoading(false);
  }, [sdkClient, password]);

  // useEffect(() => {
  //   if (options.autoUpdate) {
  //     const interval = setInterval(() => {
  //       loadTransactions();
  //     }, options.autoUpdateInterval);
  //     return () => clearInterval(interval);
  //   }
  // }, [loadTransactions, options]);

  return {
    transactions,
    stats,
    loadTransactions,
    isLoading,
    error,
  }
}
