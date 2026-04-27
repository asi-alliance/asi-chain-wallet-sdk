import type { MouseEvent, ReactElement } from "react";
import {
    formatAddress,
    formatAmount,
    formatDate,
    type Transaction,
} from "../../fixtures/txHistory.fixture";

interface TxListItemProps {
    transaction: Transaction;
    onCopy: (text: string) => void | Promise<void>;
}

const TxListItem = ({
    transaction,
    onCopy,
}: TxListItemProps): ReactElement => {
    const handleCopyDeployId = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();

        if (transaction.deployId) {
            void onCopy(transaction.deployId);
        }
    };

    return (
        <tr id={`history-transaction-row-${transaction.id}`}>
            <td>{formatDate(transaction.timestamp)}</td>
            <td>{transaction.type}</td>
            <td>{transaction.status}</td>
            <td>
                {transaction.from === "Unknown"
                    ? "Unknown"
                    : formatAddress(transaction.from)}
            </td>
            <td>{transaction.to ? formatAddress(transaction.to) : "-"}</td>
            <td>{formatAmount(transaction.amount)}</td>
            <td>
                {transaction.note && <div>{transaction.note}</div>}

                {transaction.deployId && (
                    <div>
                        Deploy: {transaction.deployId.substring(0, 16)}...
                        <button
                            id={`copy-deployid-${transaction.id}`}
                            type="button"
                            onClick={handleCopyDeployId}
                        >
                            Copy
                        </button>
                    </div>
                )}

                {transaction.blockHash && (
                    <div>
                        Block: {transaction.blockHash.substring(0, 16)}...
                    </div>
                )}
            </td>
        </tr>
    );
};

export default TxListItem;
