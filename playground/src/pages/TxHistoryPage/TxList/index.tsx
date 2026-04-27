import type { ReactElement } from "react";
import type {
    Transaction,
    TxHistoryAccount,
} from "../fixtures/txHistory.fixture";
import TxListItem from "./TxListItem";

interface TxListProps {
    transactions: Transaction[];
    selectedAccount: TxHistoryAccount | null;
}

const TxList = ({
    transactions,
    selectedAccount,
}: TxListProps): ReactElement => {
    return(<section className="section">
        <h2>TxList</h2>
        {
            !transactions.length? 
            <div>
                {selectedAccount ? (
                    <>
                        <p>No transactions found for {selectedAccount.name}.</p>
                        <p>
                            Your transaction history will appear here once you
                            send, receive, or deploy contracts.
                        </p>
                    </>
                ) : (
                    <p>Please select an account to view transaction history.</p>
                )}
            </div> :
                    <div>
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
        </div>

        }
    </section>)
};

export default TxList;
