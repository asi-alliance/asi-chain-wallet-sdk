import { Transaction } from "@domains/Transaction";
import { NetworkId } from "@domains/Network";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import CollectionQueryService from "@services/CollectionQuery";

export interface ITransactionsHistoryWindow {
    pendingTransactions: Transaction[];
    executedPagination: Pagination;
    pageOffset: number;
    pageLimit?: number;
}

const getTransactionTimestamp = (transaction: Transaction): Date =>
    transaction.timestamp;

const compareByTimestampDesc = (
    first: Transaction,
    second: Transaction,
): number => second.timestamp.getTime() - first.timestamp.getTime();

const getExecutedOffset = (pageOffset: number, pendingCount: number): number =>
    Math.max(0, pageOffset - pendingCount);

const selectNetworkPending = (
    pending: Transaction[],
    networkId: NetworkId,
): Transaction[] =>
    CollectionQueryService.sortByDate(
        pending.filter(
            (transaction: Transaction) => transaction.networkId === networkId,
        ),
        getTransactionTimestamp,
    );

export default class TransactionsHistoryAggregator {
    public static paginatePendingTransactions(
        pending: Transaction[],
        networkId: NetworkId,
        pagination?: Pagination,
    ): Transaction[] {
        return CollectionQueryService.slice(
            selectNetworkPending(pending, networkId),
            pagination,
        );
    }

    public static createHistoryWindow(
        pending: Transaction[],
        networkId: NetworkId,
        pagination?: Pagination,
    ): ITransactionsHistoryWindow {
        const pendingTransactions: Transaction[] = selectNetworkPending(
            pending,
            networkId,
        );

        const pageOffset: number = pagination?.offset ?? 0;
        const pageLimit: number | undefined = pagination?.limit;

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
        };
    }

    public static mergeHistoryPage(
        historyWindow: ITransactionsHistoryWindow,
        executed: Transaction[],
    ): Transaction[] {
        const { pendingTransactions, pageOffset, pageLimit } = historyWindow;

        const executedIds: Set<string> = new Set(
            executed.map((transaction: Transaction) => transaction.id),
        );

        const pending: Transaction[] = pendingTransactions.filter(
            (transaction: Transaction) => !executedIds.has(transaction.id),
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
                    compareByTimestampDesc,
                ),
                { offset: pageOffset, limit: pageLimit },
            );
        }

        if (!executed.length) {
            return [];
        }

        const windowStartTime: number = executed[0].timestamp.getTime();

        const aheadCount: number = pending.filter(
            (transaction: Transaction) =>
                transaction.timestamp.getTime() > windowStartTime,
        ).length;

        return CollectionQueryService.slice(
            CollectionQueryService.mergeSorted(
                executed,
                pending.slice(aheadCount),
                compareByTimestampDesc,
            ),
            {
                offset: pageOffset - executedOffset - aheadCount,
                limit: pageLimit,
            },
        );
    }
}