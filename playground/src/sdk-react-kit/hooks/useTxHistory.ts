import { useCallback, useEffect, useState } from "react";
import { Network, Transaction, TransactionFilter, TransactionStats, TxHistory as TxHistoryService, Wallet } from "asi-wallet-sdk";

interface UseHistoryOptions {
  autoUpdate: boolean;
  autoUpdateInterval: number; //ms
}
interface TxHistory {
  stats: TransactionStats;
  transactions: Transaction[];
  refreshAndSync: () => Promise<void>;
  error: string | null;
  isLoading: boolean;
}

const defaultUseHistoryOptions: UseHistoryOptions = {
  autoUpdate: false,
  autoUpdateInterval: 30000,
}

//TODO: any
export const useTxHistory = (wallet: Wallet, network: Network, filter: TransactionFilter, options?: Partial<UseHistoryOptions>): TxHistory => {
  const [stats, setStats] = useState<TransactionStats>(null);
  const [transactions, setTransactions] = useState<Transaction[]>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);


  options = {
    ...defaultUseHistoryOptions,
    ...options,
  }

  const isAccountUnlocked = true;

  const checkPendingTransactionStatuses = useCallback(async () => {
    if (!wallet || !network || !isAccountUnlocked) return;

    // History.tsx: this prepared RChainService and optionally checked pending deploys.
    // Playground: left as a named lifecycle facade without network side effects.
  }, [isAccountUnlocked, wallet, network]);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    if (!wallet || !network) {
      setTransactions(null);
      setStats(null);
      return;
    }

    try {
      if (!wallet.revAddress || !wallet.publicKey) {
        setTransactions(null);
        setStats(null);
        return;
      }

      const txs = await TxHistoryService.getFilteredTransactions(
        wallet.revAddress,
        wallet.publicKey,
        network.name,
        network.graphqlUrl || "",
        100,
      );
      const filteredTxs = applyTransactionFilter(txs, filter);

      setTransactions(filteredTxs);
      setStats(calculateTransactionStats(filteredTxs));
    } catch (error) {
      console.error(error);
      setError(error);
      setTransactions(null);
      setStats(null);
    }
    setIsLoading(false);
  }, [filter, wallet, network]);

  useEffect(() => {
    // History.tsx: initial load + pending status check on wallet/network changes.
    // Playground: same lifecycle, backed by fixture facades.
    loadTransactions();

    checkPendingTransactionStatuses().then(() => {
      loadTransactions();
    });
  }, [checkPendingTransactionStatuses, loadTransactions]);

  useEffect(() => {
    if (options.autoUpdate) {
      const interval = setInterval(() => {
        loadTransactions();
      }, options.autoUpdateInterval);
      return () => clearInterval(interval);
    }
  }, [loadTransactions, options]);

  const refreshAndSync = async () => {
    TransactionPollingService.forceCheck();

    if (wallet && network && network.graphqlUrl) {
      try {
        await TxHistoryService.syncFromBlockchain(
          wallet.revAddress,
          wallet.publicKey,
          network.name,
          network.graphqlUrl,
        );
      } catch (error) {
        console.error(error);
        setError(error);
      }
    }

    loadTransactions();
  };

  return {
    transactions,
    stats,
    refreshAndSync,
    isLoading,
    error,
  }
}