import type { ReactElement } from "react";
import type { TransactionStats } from "../fixtures/txHistory.fixture";

interface TxHistoryStatsProps {
    stats: TransactionStats;
}

const TxHistoryStats = ({ stats }: TxHistoryStatsProps): ReactElement => {
    return (
        <section className="section">
            <h2>TxHistoryStats</h2>
            <article>
                <strong>{stats.total}</strong>
                <h4>Total Transactions</h4>
            </article>
            <article>
                <strong>{stats.sent}</strong>
                <h4>Sent</h4>
            </article>
            <article>
                <strong>{stats.received}</strong>
                <h4>Receive</h4>
            </article>
            <article>
                <strong>{stats.deployed}</strong>
                <h4>Deployments</h4>
            </article>
        </section>
    );
};

export default TxHistoryStats;
