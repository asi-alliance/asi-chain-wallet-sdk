import type { ReactElement } from "react";
import TxListItem from "./TxListItem";
import { Transaction, Wallet } from "asi-wallet-sdk";

interface TxListProps {
    transactions: Transaction[] | null;
    selectedAccount: Wallet | null;
}

const TxContent = (transactions: TxListProps["transactions"]): ReactElement => {
    if(!transactions) {
        return (<>
            N/A
        </>)
    };
    if(!transactions.length) {
        return (<>
            Empty transactions list
        </>)
    };
    return (
        <table className="table">
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
                    />
                ))}
            </tbody>
        </table>
    )
}

const TxList = ({
    transactions,
}: TxListProps): ReactElement => {
    return(
    <section className="section">
        <h2>TxList</h2>
        {TxContent(transactions)}
    </section>
    )
};

export default TxList;
