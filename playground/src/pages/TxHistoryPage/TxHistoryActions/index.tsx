import type { ReactElement } from "react";
import type { TxHistoryAccount } from "../fixtures/txHistory.fixture";

interface TxHistoryActionsProps {
    selectedAccount: TxHistoryAccount | null;
    lastRefresh: Date;
    onRefreshAndSync: () => void | Promise<void>;
    onExportJSON: () => void | Promise<void>;
    onExportCSV: () => void | Promise<void>;
}

const TxHistoryActions = ({
    selectedAccount,
    lastRefresh,
    onRefreshAndSync,
    onExportJSON,
    onExportCSV,
}: TxHistoryActionsProps): ReactElement => {
    return (
        <section>
            <div>
                <p>Auto-refresh: every 30s</p>
                <p>Last: {lastRefresh.toLocaleTimeString()}</p>

                <button
                    id="history-refresh-button"
                    type="button"
                    onClick={() => void onRefreshAndSync()}
                >
                    Refresh &amp; Sync
                </button>
            </div>

            <div>
                <button
                    id="history-export-json-button"
                    type="button"
                    onClick={() => void onExportJSON()}
                >
                    Export JSON
                </button>
                <button
                    id="history-export-csv-button"
                    type="button"
                    onClick={() => void onExportCSV()}
                >
                    Export CSV
                </button>
            </div>
        </section>
    );
};

export default TxHistoryActions;
