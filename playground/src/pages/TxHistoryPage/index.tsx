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
    selectedNetworkFixture,
} from "./fixtures/txHistory.fixture";
import "./styles.css";
import { TxHistoryPrerequisites } from "./TxHistoryPrerequisites";
import { useTxHistory } from "../../sdk-react-kit/hooks/useTxHistory";
import { type TransactionFilter } from "asi-wallet-sdk";

const TxHistoryPage = (): ReactElement => {
    // History.tsx: selectedAccount/selectedNetwork came from Redux selectors.
    // Playground: fixed fixtures keep UI ready for the future SDK state source.
    // const selectedAccount = selectedAccountFixture;
    const selectedAccount = "testSelectedAccount";
    const selectedNetwork = selectedNetworkFixture;
    const networks = networksFixture;

    const [account, setAccount] = useState(null);
    const [network, setNetwork] = useState(null);
    const [filter, setFilter] = useState<TransactionFilter>({});

    const {transactions, stats, refreshAndSync, isLoading: isTxHistoryLoading, error: txHistoryError} = useTxHistory(selectedAccount, selectedNetwork, filter, {autoUpdate: true});

    const onFilterChange = useCallback((nextFilter: TransactionFilter) => {
        setFilter(nextFilter);
    }, []);

    return (
        <main className="tx-history-page">
            <h1>Transactions</h1>
            <TxHistoryPrerequisites account={account} setAccount={setAccount} network={network} setNetwork={setNetwork} />
            <TxHistoryActions
                selectedAccount={selectedAccount}
                selectedNetwork={selectedNetwork}
                onRefreshAndSync={refreshAndSync}
                isTxHistoryLoading={isTxHistoryLoading}
                txHistoryError={txHistoryError}
            />
            <TxHistoryFilters
                filter={filter}
                networks={networks}
                onFilterChange={onFilterChange}
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
