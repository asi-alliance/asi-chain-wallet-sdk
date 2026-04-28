import type { MouseEvent, ReactElement } from "react";
import { copyTextToClipboard } from "@utils/misc";
import { type Transaction} from "asi-wallet-sdk";
import { formatAddress, formatAmount, formatDate } from "../../../../sdk-react-kit";

interface TxListItemProps {
    transaction: Transaction;
}

const TxListItem = ({
    transaction,
}: TxListItemProps): ReactElement => {
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
            <td>{transaction.type}</td>
            <td>{transaction.status}</td>
            <td>
                {transaction.from === "Unknown"
                    ? "Unknown"
                    : formatAddress(transaction.from)}
            </td>
            <td>{transaction.to ? formatAddress(transaction.to) : "-"}</td>
            <td>{transaction.amount}</td>
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
