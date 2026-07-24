import type { MouseEvent, ReactElement } from "react";
import { copyTextToClipboard } from "@utils/misc";
import { type Transaction } from "asi-wallet-sdk";
import { formatAddress, formatDate } from "../../../../sdk-react-kit";

interface TxListItemProps {
    transaction: Transaction;
}

const TxListItem = ({ transaction }: TxListItemProps): ReactElement => {
    const handleCopyDeployId = async (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();

        if (transaction.deployId) {
            try {
                await copyTextToClipboard(transaction.deployId);
            } catch (error) {
                console.error(error);
            }
        }
    };

    return (
        <tr id={`history-transaction-row-${transaction.id}`}>
            <td>{formatDate(transaction.timestamp)}</td>
            <td>
                <span className="tx-table__type">{transaction.type}</span>
            </td>
            <td>
                <span
                    className={`tx-table__status tx-table__status--${transaction.status}`}
                >
                    {transaction.status}
                </span>
            </td>
            <td className="tx-table__mono">
                {transaction.from === "Unknown"
                    ? "Unknown"
                    : formatAddress(transaction.from)}
            </td>
            <td className="tx-table__mono">
                {transaction.to ? formatAddress(transaction.to) : "-"}
            </td>
            <td>{transaction.amount ?? "-"}</td>
            <td>
                <div className="tx-table__details">
                    {transaction.note && <div>{transaction.note}</div>}

                    {transaction.deployId && (
                        <div>
                            Deploy: {transaction.deployId.substring(0, 16)}...
                            <button
                                id={`copy-deployid-${transaction.id}`}
                                type="button"
                                className="tx-table__copy"
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
                </div>
            </td>
        </tr>
    );
};

export default TxListItem;
