import { Transaction } from "@domains/Transaction";
import { NetworkId } from "@domains/Network";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import CollectionQueryService from "@services/CollectionQuery";

export interface IPaginatedPendingTransactions {
    pendingTransactions: Transaction[];
    confirmedPagination: Pagination;
}

const getTransactionTimestamp = (transaction: Transaction): Date =>
    transaction.timestamp;

export default class TransactionsHistoryAggregator {
    public static paginatePendingTransactions(
        pending: Transaction[],
        networkId: NetworkId,
        pagination?: Pagination,
    ): IPaginatedPendingTransactions {
        const networkPending: Transaction[] = pending.filter(
            (transaction: Transaction) => transaction.networkId === networkId,
        );

        const { items, restPagination } = CollectionQueryService.paginate(
            CollectionQueryService.sortByDate(
                networkPending,
                getTransactionTimestamp,
            ),
            pagination,
        );

        return {
            pendingTransactions: items,
            confirmedPagination: restPagination,
        };
    }

    public static aggregate(
        confirmed: Transaction[],
        pending: Transaction[],
    ): Transaction[] {
        const transactionsByDeployId: Map<string, Transaction> = new Map();

        for (const transaction of pending) {
            transactionsByDeployId.set(transaction.id, transaction);
        }

        for (const transaction of confirmed) {
            transactionsByDeployId.set(transaction.id, transaction);
        }

        return CollectionQueryService.sortByDate(
            Array.from(transactionsByDeployId.values()),
            getTransactionTimestamp,
        );
    }
}