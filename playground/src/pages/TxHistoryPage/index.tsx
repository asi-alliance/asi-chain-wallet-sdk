import {
    useCallback,
    useEffect,
    useState,
    type ReactElement,
} from "react";
import TxHistoryActions from "./TxHistoryActions";
import TxHistoryFilters from "./TxHistoryFilters";
import TxHistoryStats from "./TxHistoryStats";
import TxList from "./TxList";
import {
    TransactionHistoryService,
    TransactionPollingService,
    applyTransactionFilter,
    calculateTransactionStats,
    emptyTransactionStats,
    fetchBalance,
    networksFixture,
    selectedAccountFixture,
    selectedNetworkFixture,
    type Transaction,
    type TransactionFilter,
    type TransactionStats,
} from "./fixtures/txHistory.fixture";
import "./styles.css";
import { TxHistoryPrerequisites } from "./TxHistoryPrerequisites";

const TxHistoryPage = (): ReactElement => {
    // History.tsx: selectedAccount/selectedNetwork came from Redux selectors.
    // Playground: fixed fixtures keep UI ready for the future SDK state source.
    const selectedAccount = selectedAccountFixture;
    const selectedNetwork = selectedNetworkFixture;
    const networks = networksFixture;

    // History.tsx: unlocked account state came from auth Redux state.
    // Playground: the facade assumes the fixture account is unlocked.
    const isAccountUnlocked = true;

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [filter, setFilter] = useState<TransactionFilter>({});
    const [stats, setStats] = useState<TransactionStats>(emptyTransactionStats);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const checkPendingTransactionStatuses = useCallback(async () => {
        if (!selectedAccount || !selectedNetwork || !isAccountUnlocked) return;

        if (!selectedNetwork.graphqlUrl || !selectedNetwork.graphqlUrl.trim()) {
            return;
        }

        // History.tsx: this prepared RChainService and optionally checked pending deploys.
        // Playground: left as a named lifecycle facade without network side effects.
    }, [isAccountUnlocked, selectedAccount, selectedNetwork]);

    const loadTransactions = useCallback(async () => {
        if (!selectedAccount || !selectedNetwork) {
            setTransactions([]);
            setStats(emptyTransactionStats);
            return;
        }

        try {
            if (!selectedAccount.revAddress || !selectedAccount.publicKey) {
                setTransactions([]);
                setStats(emptyTransactionStats);
                return;
            }

            const txs = await TransactionHistoryService.getTransactions(
                selectedAccount.revAddress,
                selectedAccount.publicKey,
                selectedNetwork.name,
                selectedNetwork.graphqlUrl || "",
                100,
            );
            const filteredTxs = applyTransactionFilter(txs, filter);

            setTransactions(filteredTxs);
            setStats(calculateTransactionStats(filteredTxs));
        } catch (error) {
            console.error(error);
            setTransactions([]);
            setStats(emptyTransactionStats);
        }
    }, [filter, selectedAccount, selectedNetwork]);

    useEffect(() => {
        // History.tsx: initial load + pending status check on account/network changes.
        // Playground: same lifecycle, backed by fixture facades.
        loadTransactions();

        checkPendingTransactionStatuses().then(() => {
            loadTransactions();
        });
    }, [checkPendingTransactionStatuses, loadTransactions]);

    useEffect(() => {
        // History.tsx: polling reloaded real blockchain-backed history every 30 seconds.
        // Playground: polling reloads fixture data so the UI contract stays visible.
        const interval = setInterval(() => {
            loadTransactions();
            setLastRefresh(new Date());
        }, 30000);

        return () => clearInterval(interval);
    }, [loadTransactions]);

    const handleExportJSON = async () => {
        if (!selectedAccount || !selectedNetwork) return;

        try {
            await TransactionHistoryService.downloadTransactions(
                "json",
                selectedAccount.revAddress,
                selectedAccount.publicKey,
                selectedNetwork.name,
                selectedNetwork.graphqlUrl || "",
            );
        } catch (error) {
            console.error(error);
        }
    };

    const handleExportCSV = async () => {
        if (!selectedAccount || !selectedNetwork) return;

        try {
            await TransactionHistoryService.downloadTransactions(
                "csv",
                selectedAccount.revAddress,
                selectedAccount.publicKey,
                selectedNetwork.name,
                selectedNetwork.graphqlUrl || "",
            );
        } catch (error) {
            console.error(error);
        }
    };

    const handleFilterChange = (
        key: keyof TransactionFilter,
        value: TransactionFilter[keyof TransactionFilter] | "all" | "",
    ) => {
        setFilter((previousFilter) => ({
            ...previousFilter,
            [key]: value === "all" || value === "" ? undefined : value,
        }));
    };

    const handleClearFilters = () => {
        setFilter({});
    };

    const handleRefreshAndSync = async () => {
        TransactionPollingService.forceCheck();

        if (selectedAccount && selectedNetwork && selectedNetwork.graphqlUrl) {
            try {
                await TransactionHistoryService.syncFromBlockchain(
                    selectedAccount.revAddress,
                    selectedAccount.publicKey,
                    selectedNetwork.name,
                    selectedNetwork.graphqlUrl,
                );
            } catch (error) {
                console.error(error);
            }
        }

        if (selectedAccount && selectedNetwork) {
            try {
                const oldBalance = selectedAccount.balance || "0";
                const balanceResult = await fetchBalance({
                    account: selectedAccount,
                    network: selectedNetwork,
                });
                const newBalance = balanceResult.balance;

                if (parseFloat(newBalance) > parseFloat(oldBalance)) {
                    TransactionHistoryService.detectReceivedTransaction(
                        selectedAccount.revAddress,
                        oldBalance,
                        newBalance,
                        selectedNetwork.name,
                    );
                }
            } catch (error) {
                console.error(error);
            }
        }

        loadTransactions();
        setLastRefresh(new Date());
    };

    return (
        <main className="tx-history-page">
            <h1>Transactions</h1>
            <TxHistoryPrerequisites selectedAccount={selectedAccount} />
            <TxHistoryActions
                lastRefresh={lastRefresh}
                onRefreshAndSync={handleRefreshAndSync}
                onExportJSON={handleExportJSON}
                onExportCSV={handleExportCSV}
            />
            <TxHistoryFilters
                filter={filter}
                networks={networks}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
            />
            <TxHistoryStats stats={stats} />
            <TxList
                transactions={transactions}
                selectedAccount={selectedAccount}
            />
        </main>
    );
};

export default TxHistoryPage;
