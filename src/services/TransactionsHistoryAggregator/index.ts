import { Transaction } from "@domains/Transaction";
import { NetworkId } from "@domains/Network";

export default class TransactionsHistoryAggregator {
    public static aggregate(
        confirmed: Transaction[],
        pending: Transaction[],
        networkId: NetworkId,
    ): Transaction[] {
        const transactionsByDeployId: Map<string, Transaction> = new Map();

        for (const transaction of pending) {
            if (transaction.networkId === networkId) {
                transactionsByDeployId.set(transaction.id, transaction);
            }
        }

        for (const transaction of confirmed) {
            transactionsByDeployId.set(transaction.id, transaction);
        }

        return Array.from(transactionsByDeployId.values()).sort(
            (first, second) =>
                second.timestamp.getTime() - first.timestamp.getTime(),
        );
    }
}
