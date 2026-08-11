import {
    ITransactionsHistoryFilters,
    ITransactionsHistoryPage,
    ITransactionsHistoryQuery,
    Transaction,
} from "@domains/Transaction";
import { NetworkId } from "@domains/Network";
import {
    DEFAULT_HISTORY_ORDER,
    Order,
    Pagination,
} from "@services/GraphqlParser/queryOptions";
import CollectionQueryService, {
    TCollectionComparator,
} from "@services/CollectionQuery";

export interface ITransactionsHistoryWindow {
    pendingTransactions: Transaction[];
    executedPagination: Pagination;
    pageOffset: number;
    pageLimit?: number;
    order: Order;
}

const getTransactionTimestamp = (transaction: Transaction): Date =>
    transaction.timestamp;

const createTimestampComparator =
    (order: Order): TCollectionComparator<Transaction> =>
    (first: Transaction, second: Transaction) =>
        order === "asc"
            ? first.timestamp.getTime() - second.timestamp.getTime()
            : second.timestamp.getTime() - first.timestamp.getTime();

const getExecutedOffset = (pageOffset: number, pendingCount: number): number =>
    Math.max(0, pageOffset - pendingCount);


const matchesPendingHistoryFilters = (
    transaction: Transaction,
    { type, period }: ITransactionsHistoryFilters,
): boolean => {
    if (type && transaction.type !== type) {
        return false;
    }

    if (period?.from && transaction.timestamp < period.from) {
        return false;
    }

    if (period?.to && transaction.timestamp > period.to) {
        return false;
    }

    return true;
};

const selectNetworkPending = (
    pending: Transaction[],
    networkId: NetworkId,
    { order = DEFAULT_HISTORY_ORDER, filters = {} }: ITransactionsHistoryQuery,
): Transaction[] =>
    CollectionQueryService.sortByDate(
        pending.filter(
            (transaction: Transaction) =>
                transaction.networkId === networkId &&
                matchesPendingHistoryFilters(transaction, filters),
        ),
        getTransactionTimestamp,
        order,
    );

const selectUnindexedPending = (
    pendingTransactions: Transaction[],
    executed: Transaction[],
): Transaction[] => {
    const executedIds: Set<string> = new Set(
        executed.map((transaction: Transaction) => transaction.id),
    );

    return pendingTransactions.filter(
        (transaction: Transaction) => !executedIds.has(transaction.id),
    );
};

export default class TransactionsHistoryAggregator {
    public static createPendingHistoryPage(
        pending: Transaction[],
        networkId: NetworkId,
        historyQuery: ITransactionsHistoryQuery = {},
    ): ITransactionsHistoryPage {
        const pendingTransactions: Transaction[] = selectNetworkPending(
            pending,
            networkId,
            historyQuery,
        );

        return {
            items: CollectionQueryService.slice(
                pendingTransactions,
                historyQuery.pagination,
            ),
            total: pendingTransactions.length,
        };
    }

    public static createHistoryWindow(
        pending: Transaction[],
        networkId: NetworkId,
        historyQuery: ITransactionsHistoryQuery = {},
    ): ITransactionsHistoryWindow {
        const pendingTransactions: Transaction[] = selectNetworkPending(
            pending,
            networkId,
            historyQuery,
        );

        const { pagination = {}, order = DEFAULT_HISTORY_ORDER } = historyQuery;

        const pageOffset: number = pagination.offset ?? 0;
        const pageLimit: number | undefined = pagination.limit;

        const executedPagination: Pagination = {
            offset: getExecutedOffset(pageOffset, pendingTransactions.length),
        };

        if (pageLimit !== undefined) {
            executedPagination.limit = pageLimit + pendingTransactions.length;
        }

        return {
            pendingTransactions,
            executedPagination,
            pageOffset,
            pageLimit,
            order,
        };
    }

    public static countUnindexedPending(
        historyWindow: ITransactionsHistoryWindow,
        executed: Transaction[],
    ): number {
        return selectUnindexedPending(
            historyWindow.pendingTransactions,
            executed,
        ).length;
    }

    public static mergeHistoryPage(
        historyWindow: ITransactionsHistoryWindow,
        executed: Transaction[],
    ): Transaction[] {
        const { pendingTransactions, pageOffset, pageLimit, order } =
            historyWindow;

        const compareByTimestamp: TCollectionComparator<Transaction> =
            createTimestampComparator(order);

        const pending: Transaction[] = selectUnindexedPending(
            pendingTransactions,
            executed,
        );

        const executedOffset: number = getExecutedOffset(
            pageOffset,
            pendingTransactions.length,
        );

        if (!executedOffset) {
            return CollectionQueryService.slice(
                CollectionQueryService.mergeSorted(
                    executed,
                    pending,
                    compareByTimestamp,
                ),
                { offset: pageOffset, limit: pageLimit },
            );
        }

        if (!executed.length) {
            return [];
        }

        const aheadCount: number = pending.filter(
            (transaction: Transaction) =>
                compareByTimestamp(transaction, executed[0]) < 0,
        ).length;

        return CollectionQueryService.slice(
            CollectionQueryService.mergeSorted(
                executed,
                pending.slice(aheadCount),
                compareByTimestamp,
            ),
            {
                offset: pageOffset - executedOffset - aheadCount,
                limit: pageLimit,
            },
        );
    }
}