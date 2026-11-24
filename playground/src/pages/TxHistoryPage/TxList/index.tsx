import type { ReactElement } from "react";
import TxListItem from "./TxListItem";
import { Transaction } from "asi-wallet-sdk";

interface TxListProps {
    transactions: Transaction[] | null;
    nativeTokenDecimals: number;
}

const TxContent = (
    transactions: TxListProps["transactions"],
    nativeTokenDecimals: TxListProps["nativeTokenDecimals"],
): ReactElement => {
    if (!transactions) {
        return (
            <p className="tx-history-page__empty">
                Select an account to load its history.
            </p>
        );
    }

    if (!transactions.length) {
        return (
            <p className="tx-history-page__empty">No transactions found.</p>
        );
    }

    return (
        <div className="tx-table-wrap">
            <table className="tx-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Amount</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.map((transaction) => (
                        <TxListItem
                            key={transaction.id}
                            transaction={transaction}
                            nativeTokenDecimals={nativeTokenDecimals}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const TxList = ({
    transactions,
    nativeTokenDecimals,
}: TxListProps): ReactElement => {
    return TxContent(transactions, nativeTokenDecimals);
};

export default TxList;
