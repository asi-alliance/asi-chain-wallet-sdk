import {
    useCallback,
    useEffect,
    useState,
    type ReactElement,
} from "react";
import KeyValueTable from "@components/common/KeyValueTable";
import { Network, Pagination, TransactionFilter, Wallet} from "asi-wallet-sdk";
import { TxHistorySlice } from "../../../sdk-react-kit/hooks/txHistorySlice";
import { NetworkSlice } from "../../../sdk-react-kit/hooks/networkSlice";

interface TxHistoryActionsProps {
    selectedAccount?: Wallet;
    network: NetworkSlice;
    filter: TransactionFilter;
    txHistory: TxHistorySlice;
}

const pagination: Pagination = {
    offset: 0,
    // limit: Number.POSITIVE_INFINITY,
    limit: undefined,
}

const TxHistoryActions = ({
    selectedAccount,
    filter,
    txHistory,
    network
}: TxHistoryActionsProps): ReactElement => {
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const handleRefreshAndSync = async () => {
        await txHistory.loadTransactions(pagination);
        setLastRefresh(new Date());
    };
    useEffect(() => {
        handleRefreshAndSync();
    }, [selectedAccount, filter, pagination, network.currentNetwork]); 

    const onDownloadTxs = useCallback(async (format: "json" | "csv") => {
        try {
            txHistory.downloadTransactions(
                // publicKey,
                pagination,
                format,
            );
        } catch (error) {
            console.error(error);
        }
    }, [txHistory, selectedAccount]);

    return (
        <section className="section">
            <h2>TxHistoryActions</h2>
            <div>
                <KeyValueTable
                    rows={[
                        { key: "isTxHistoryLoading:", value: String(txHistory.isLoading) },
                        { key: "txHistoryError", value: String(txHistory.error), state: txHistory.error!==null ? "error" : "" },
                        { key: "Last:", value: lastRefresh.toLocaleTimeString() },
                    ]}
                />

                <button
                    id="history-refresh-button"
                    type="button"
                    onClick={() => handleRefreshAndSync()}
                >
                    Refresh &amp; Sync
                </button>
            </div>

            <div>
                <button
                    id="history-export-json-button"
                    type="button"
                    onClick={() => onDownloadTxs("json")}
                >
                    Export JSON
                </button>
                <button
                    id="history-export-csv-button"
                    type="button"
                    onClick={() => onDownloadTxs("csv")}
                >
                    Export CSV
                </button>
            </div>
        </section>
    );
};

export default TxHistoryActions;
