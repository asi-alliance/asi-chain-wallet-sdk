import {
    useCallback,
    useState,
    type ReactElement,
} from "react";
import KeyValueTable from "@components/common/KeyValueTable";
import {Network, TxHistory, Wallet} from "asi-wallet-sdk";

interface TxHistoryActionsProps {
    selectedAccount?: Wallet;
    selectedNetwork?: Network;
    onRefreshAndSync: () => void | Promise<void>;
    isTxHistoryLoading: boolean;
    txHistoryError: string | null;
    offset: number;
    limit: number;
}

const TxHistoryActions = ({
    selectedAccount,
    selectedNetwork,
    onRefreshAndSync,
    isTxHistoryLoading,
    txHistoryError,
    offset,
    limit,
}: TxHistoryActionsProps): ReactElement => {
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const handleRefreshAndSync = async () => {
        await onRefreshAndSync();
        setLastRefresh(new Date());
    };

    const handleExportJSON = useCallback(async () => {
        if (!selectedAccount || !selectedNetwork) return;

        try {
            const publicKey = selectedAccount.getPublicKey();
            if (!publicKey?.length) {
                throw new Error("Wallet public key is missing");
            }

            await TxHistory.downloadTransactions(
                selectedNetwork,
                selectedAccount.getAddress(),
                publicKey,
                offset,
                limit,
                "json",
            );
        } catch (error) {
            console.error(error);
        }
    }, [selectedAccount, selectedNetwork]);

    const handleExportCSV = useCallback(async () => {
        if (!selectedAccount || !selectedNetwork) return;

        try {
            const publicKey = selectedAccount.getPublicKey();
            if (!publicKey?.length) {
                throw new Error("Wallet public key is missing");
            }

            await TxHistory.downloadTransactions(
                selectedNetwork,
                selectedAccount.getAddress(),
                publicKey,
                offset,
                limit,
                "csv",
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
