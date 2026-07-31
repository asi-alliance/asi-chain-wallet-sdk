import { Order, Pagination } from "@services/GraphqlParser/queryOptions";

export interface IPaginatedChunk<TItem> {
    items: TItem[];
    restPagination: Pagination;
}

export default class CollectionQueryService {
    public static sortByComparator<TItem>(
        items: TItem[],
        comparator: (firstItem: TItem, secondItem: TItem) => number,
    ): TItem[] {
        return [...items].sort(comparator);
    }

    public static sortByDate<TItem>(
        items: TItem[],
        getDate: (item: TItem) => Date,
        order: Order = "desc",
    ): TItem[] {
        const direction: number = order === "desc" ? -1 : 1;

        return CollectionQueryService.sortByComparator<TItem>(
            items,
            (first: TItem, second: TItem) =>
                direction *
                (getDate(first).getTime() - getDate(second).getTime()),
        );
    }

    public static paginate<TItem>(
        items: TItem[],
        pagination?: Pagination,
    ): IPaginatedChunk<TItem> {
        const offset: number = pagination?.offset ?? 0;
        const limit: number | undefined = pagination?.limit;

        const paginatedItems: TItem[] = items.slice(
            offset,
            limit === undefined ? undefined : offset + limit,
        );

        const restPagination: Pagination = {
            offset: Math.max(0, offset - items.length),
        };

        if (limit !== undefined) {
            restPagination.limit = limit - paginatedItems.length;
        }

        return { items: paginatedItems, restPagination };
    }
}