import {
    useCallback,
    useState,
    type ReactElement,
} from "react";
import KeyValueTable from "@components/common/KeyValueTable";
import {Network, Pagination, TransactionFilter, Wallet} from "asi-wallet-sdk";
import { TxHistory } from "../../../sdk-react-kit/hooks/useTxHistory";

interface TxHistoryActionsProps {
    selectedAccount?: Wallet;
    selectedNetwork?: Network;
    filter: TransactionFilter;
    txHistory: TxHistory;
}

const pagination: Pagination = {
    offset: 0,
    // limit: Number.POSITIVE_INFINITY,
    limit: undefined,
}

const TxHistoryActions = ({
    selectedAccount,
    selectedNetwork,
    filter,
    txHistory
}: TxHistoryActionsProps): ReactElement => {
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const handleRefreshAndSync = async () => {
        await txHistory.loadTransactions(selectedNetwork, selectedAccount, filter, pagination)
        setLastRefresh(new Date());
    };

    const handleExportJSON = useCallback(async () => {
        try {
            // const publicKey = selectedAccount.getPublicKey();
            // if (!publicKey?.length) {
                // throw new Error("Wallet public key is missing");
            // }

            // await TxHistory.downloadTransactions(
            //     selectedNetwork,
            //     selectedAccount.getAddress(),
            //     publicKey,
            //     offset,
            //     limit,
            //     "json",
            // );
        } catch (error) {
            console.error(error);
        }
    }, [selectedAccount, selectedNetwork]);

    const handleExportCSV = useCallback(async () => {
        try {
            // const publicKey = selectedAccount.getPublicKey();
            // if (!publicKey?.length) {
            //     throw new Error("Wallet public key is missing");
            // }

            // await TxHistory.downloadTransactions(
            //     selectedNetwork,
            //     selectedAccount.getAddress(),
            //     publicKey,
            //     offset,
            //     limit,
            //     "csv",
            // );
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
