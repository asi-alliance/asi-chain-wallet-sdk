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
import { Wallet, type TransactionFilter } from "asi-wallet-sdk";
import { useSdkContext } from "../../sdk-react-kit";

const TxHistoryPage = (): ReactElement => {
    const networks = networksFixture;

    const [wallet, setWallet] = useState(null);
    const [network, setNetwork] = useState(networks[0]);
    const [filter, setFilter] = useState<TransactionFilter>({});

    const {txHistory} = useSdkContext();

    const onFilterChange = useCallback((nextFilter: TransactionFilter) => {
        setFilter(nextFilter);
        txHistory.setFilter(nextFilter);
    }, [txHistory]);
    const onWalletChange = useCallback((wallet: Wallet) => {
        setWallet(wallet);
        txHistory.setAddress(wallet.getAddress())
    }, [txHistory]);

    return (
        <main className="tx-history-page">
            <h1>Transactions</h1>
            <TxHistoryPrerequisites account={wallet} setAccount={onWalletChange} network={network} setNetwork={setNetwork} />
            <TxHistoryActions
                selectedAccount={wallet}
                selectedNetwork={network}
                filter={filter}
                txHistory={txHistory}
            />
            <TxHistoryFilters
                filter={filter}
                networks={networks}
                onFilterChange={onFilterChange}
            />
            <TxHistoryStats stats={txHistory.stats} />
            <TxList
                transactions={txHistory.transactions}
                selectedAccount={wallet}
            />
        </main>
    );
};

export default TxHistoryPage;
