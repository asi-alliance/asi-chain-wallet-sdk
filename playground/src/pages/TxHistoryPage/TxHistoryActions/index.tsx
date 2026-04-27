import {
    useCallback,
    useEffect,
    useState,
    type ReactElement,
} from "react";
import KeyValueTable from "@components/common/KeyValueTable";
import {
    TransactionHistoryService,
    type Account,
    type Network,
} from "../fixtures/txHistory.fixture";

interface TxHistoryActionsProps {
    selectedAccount?: Account;
    selectedNetwork?: Network;
    onRefreshAndSync: () => void | Promise<void>;
    isTxHistoryLoading: boolean;
    txHistoryError: string | null;
}

const TxHistoryActions = ({
    selectedAccount,
    selectedNetwork,
    onRefreshAndSync,
    isTxHistoryLoading,
    txHistoryError,
}: TxHistoryActionsProps): ReactElement => {
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setLastRefresh(new Date());
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    const handleRefreshAndSync = async () => {
        await onRefreshAndSync();
        setLastRefresh(new Date());
    };

    const handleExportJSON = useCallback(async () => {
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
    }, [selectedAccount, selectedNetwork]);

    const handleExportCSV = useCallback(async () => {
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
    }, [selectedAccount, selectedNetwork]);

    return (
        <section className="section">
            <h2>TxHistoryActions</h2>
            <div>
                <KeyValueTable
                    rows={[
                        { key: "isTxHistoryLoading:", value: isTxHistoryLoading.toString() },
                        { key: "txHistoryError", value: String(txHistoryError), state: txHistoryError!==null ? "error" : "" },
                        { key: "Last:", value: lastRefresh.toLocaleTimeString() },
                    ]}
                />

                <button
                    id="history-refresh-button"
                    type="button"
                    onClick={() => void handleRefreshAndSync()}
                >
                    Refresh &amp; Sync
                </button>
            </div>

            <div>
                <button
                    id="history-export-json-button"
                    type="button"
                    onClick={() => void handleExportJSON()}
                >
                    Export JSON
                </button>
                <button
                    id="history-export-csv-button"
                    type="button"
                    onClick={() => void handleExportCSV()}
                >
                    Export CSV
                </button>
            </div>
        </section>
    );
};

export default TxHistoryActions;
