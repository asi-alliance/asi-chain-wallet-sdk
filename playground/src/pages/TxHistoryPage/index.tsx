import {
    useCallback,
    useState,
    type ReactElement,
} from "react";
import TxHistoryActions from "./TxHistoryActions";
import TxHistoryFilters from "./TxHistoryFilters";
import TxHistoryStats from "./TxHistoryStats";
import TxList from "./TxList";
import "./styles.css";
import { TxHistoryPrerequisites } from "./TxHistoryPrerequisites";
import { Wallet, type TransactionFilter } from "asi-wallet-sdk";
import { useSdkContext } from "../../sdk-react-kit";
import NetworkSelector from "@components/NetworkSelector";
import { ReservationList } from "./ReservationList/ReservationList";

const TxHistoryPage = (): ReactElement => {
    const [wallet, setWallet] = useState<Wallet>(null);
    const [filter, setFilter] = useState<TransactionFilter>({});

    const {txHistory, network} = useSdkContext();

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
            <NetworkSelector />
            <h1>Transactions</h1>
            <TxHistoryPrerequisites account={wallet} setAccount={onWalletChange} />
            <TxHistoryActions
                selectedAccount={wallet}
                network={network}
                filter={filter}
                txHistory={txHistory}
            />
            <TxHistoryFilters
                filter={filter}
                // networks={network.networks}
                onFilterChange={onFilterChange}
            />
            <TxHistoryStats stats={txHistory.stats} />
            <TxList
                transactions={txHistory.transactions}
                selectedAccount={wallet}
            />
            <ReservationList />
        </main>
    );
};

export default TxHistoryPage;
