import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, Client, Network, Pagination, Transaction, TransactionFilter, TransactionStats } from "asi-wallet-sdk";
import { NetworkSlice } from "./networkSlice";

// interface UseHistoryOptions {
//   autoUpdate: boolean;
//   autoUpdateInterval: number; //ms
// }
export interface TxHistorySlice {
    txHistorySetters: {
        setAllLocalTxs: React.Dispatch<any>,
        setIndexerTransactions: React.Dispatch<any>,
    }

    setAddress: React.Dispatch<Address>,
    setFilter: React.Dispatch<TransactionFilter>,
    stats: TransactionStats;
    transactions: Transaction[];
    loadTransactions: (...args: any) => Promise<any>; //TODO: any
    downloadTransactions: (...args: any) => Promise<any>;
    error: string | null;
    isLoading: boolean;
}

// const defaultUseHistoryOptions: UseHistoryOptions = {
//   autoUpdate: false,
//   autoUpdateInterval: 30000,
// }

export const txHistorySlice = (sdkClient: Client, password: string, network: NetworkSlice): TxHistorySlice => {
    const [address, setAddress] = useState(null);
    const [filter, setFilter] = useState(null)

    const [allLocalTxs, setAllLocalTxs] = useState<Transaction[]>(null);
    const [indexerTransactions, setIndexerTransactions] = useState<Transaction[]>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<any>(null);

    const localTransactions = useMemo(() => {
        if(!sdkClient || !allLocalTxs || !address) {
            return;
        }
        const txs = sdkClient?.txHistory.filterLocalTxs(allLocalTxs, address, filter, network.currentNetwork); 
        return txs;
    }, [allLocalTxs, address, filter, network.currentNetwork]);

    const preparedData = useMemo(() => {
        if(!sdkClient || !localTransactions || !indexerTransactions) {
            return null;
        }
        return sdkClient.txHistory.buildTxHistoryWithStats(localTransactions, indexerTransactions);       
    }, [sdkClient, localTransactions, indexerTransactions]);
    const transactions = preparedData?.txs || null;
    const stats = preparedData?.stats || null;

    // const options = useMemo(() => ({
    //   ...defaultUseHistoryOptions,
    //   ..._options,
    // }), [_options]);



    const loadTransactions = useCallback(async (pagination: Pagination) => {
        if(!sdkClient) {
            return;
        }
        if(!address) {
            return null;
        }
        setIsLoading(true);
        setError(null);
        try {
            // const publicKey = wallet.getPublicKey();
            const { localTxs, indexerTxs } = await sdkClient.txHistory.getFilteredTxs(
                sdkClient.networkProvider.currentNetwork,
                address,
                filter,
                pagination,
                password
            );

            // setLocalTransactions
            setAllLocalTxs(localTxs); //TODO: solve all or filtered local txs
            setIndexerTransactions(indexerTxs);
        } catch (error) {
            console.error(error);
            setError(String(error));
            setAllLocalTxs(null); //TODO: solve all or filtered local txs
            setIndexerTransactions(null);
        }
        setIsLoading(false);
    }, [sdkClient, password, address, filter]);

    const downloadTransactions = useCallback(async (pagination: Pagination, format: "json" | "csv") => {
        await sdkClient.txHistory.downloadTransactions(sdkClient.networkProvider.currentNetwork, address, pagination, filter, format, password);
    }, [sdkClient, password, address, filter]);

    return {
        txHistorySetters: {
            setAllLocalTxs,
            setIndexerTransactions
        },
        transactions,
        stats,
        loadTransactions,
        isLoading,
        error,
        downloadTransactions,
        setAddress,
        setFilter,
    }
}
