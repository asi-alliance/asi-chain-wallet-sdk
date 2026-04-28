import {
    useCallback,
    useState,
    type ReactElement,
} from "react";
import TxHistoryActions from "./TxHistoryActions";
import TxHistoryFilters from "./TxHistoryFilters";
import TxHistoryStats from "./TxHistoryStats";
import TxList from "./TxList";
import {
    networksFixture,
} from "./fixtures/txHistory.fixture";
import "./styles.css";
import { TxHistoryPrerequisites } from "./TxHistoryPrerequisites";
import { useTxHistory } from "../../sdk-react-kit/hooks/useTxHistory";
import { type TransactionFilter } from "asi-wallet-sdk";

const TxHistoryPage = (): ReactElement => {
    const networks = networksFixture;

    const [wallet, setWallet] = useState(null);
    const [network, setNetwork] = useState(networks[0]);
    const [filter, setFilter] = useState<TransactionFilter>({});

    const {transactions, stats, loadTransactions, isLoading: isTxHistoryLoading, error: txHistoryError} = useTxHistory(wallet, network, filter, {autoUpdate: true});

    console.log("TxHistoryPage: transactions=", transactions);
    const onFilterChange = useCallback((nextFilter: TransactionFilter) => {
        setFilter(nextFilter);
    }, []);

    return (
        <main className="tx-history-page">
            <h1>Transactions</h1>
            <TxHistoryPrerequisites account={wallet} setAccount={setWallet} network={network} setNetwork={setNetwork} />
            <TxHistoryActions
                selectedAccount={wallet}
                selectedNetwork={network}
                onRefreshAndSync={loadTransactions}
                isTxHistoryLoading={isTxHistoryLoading}
                txHistoryError={txHistoryError}
                offset={0}
                limit={10}
            />
            <TxHistoryFilters
                filter={filter}
                networks={networks}
                onFilterChange={onFilterChange}
            />
            <TxHistoryStats stats={stats} />
            <TxList
                transactions={transactions}
                selectedAccount={wallet}
            />
        </main>
    );
};

export default TxHistoryPage;
