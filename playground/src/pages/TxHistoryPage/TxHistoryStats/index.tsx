import type { ReactElement } from "react";
import KeyValueTable from "@components/common/KeyValueTable";
import type { TransactionStats } from "../fixtures/txHistory.fixture";

interface TxHistoryStatsProps {
    stats: TransactionStats;
}


const TxHistoryStats = ({ stats }: TxHistoryStatsProps): ReactElement => {
    return (
        <section className="section">
            <h2>TxHistoryStats</h2>
            {
                !stats? <>N/A</> :
            <KeyValueTable
                rows={[
                    { key: "Total Transactions", value: stats.total },
                    { key: "Sent", value: stats.sent },
                    { key: "Receive", value: stats.received },
                    { key: "Deployments", value: stats.deployed },
                ]}
            />}
        </section>
    );
};

export default TxHistoryStats;
