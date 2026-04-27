import { useCallback, useEffect, useState } from "react";
import { applyTransactionFilter, calculateTransactionStats, fetchBalance, Transaction, TransactionHistoryService, TransactionPollingService, TransactionStats } from "../../pages/TxHistoryPage/fixtures/txHistory.fixture";

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
export const useTxHistory = (account: any, network: any, filter: any, options?: Partial<UseHistoryOptions>): TxHistory => {
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
    if (!account || !network || !isAccountUnlocked) return;

    if (!network.graphqlUrl || !network.graphqlUrl.trim()) {
      return;
    }

    // History.tsx: this prepared RChainService and optionally checked pending deploys.
    // Playground: left as a named lifecycle facade without network side effects.
  }, [isAccountUnlocked, account, network]);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    if (!account || !network) {
      setTransactions(null);
      setStats(null);
      return;
    }

    try {
      if (!account.revAddress || !account.publicKey) {
        setTransactions(null);
        setStats(null);
        return;
      }

      const txs = await TransactionHistoryService.getTransactions(
        account.revAddress,
        account.publicKey,
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
  }, [filter, account, network]);

  useEffect(() => {
    // History.tsx: initial load + pending status check on account/network changes.
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

    if (account && network && network.graphqlUrl) {
      try {
        await TransactionHistoryService.syncFromBlockchain(
          account.revAddress,
          account.publicKey,
          network.name,
          network.graphqlUrl,
        );
      } catch (error) {
        console.error(error);
        setError(error);
      }
    }

    if (account && network) {
      try {
        const oldBalance = account.balance || "0";
        const balanceResult = await fetchBalance({
          account: account,
          network: network,
        });
        const newBalance = balanceResult.balance;

        if (parseFloat(newBalance) > parseFloat(oldBalance)) {
          TransactionHistoryService.detectReceivedTransaction(
            account.revAddress,
            oldBalance,
            newBalance,
            network.name,
          );
        }
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