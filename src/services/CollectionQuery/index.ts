import { Order, Pagination } from "@services/GraphqlParser/queryOptions";

export type TCollectionComparator<TItem> = (
    firstItem: TItem,
    secondItem: TItem,
) => number;

export default class CollectionQueryService {
    public static sortByComparator<TItem>(
        items: TItem[],
        comparator: TCollectionComparator<TItem>,
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

    public static mergeSorted<TItem>(
        primary: TItem[],
        secondary: TItem[],
        comparator: TCollectionComparator<TItem>,
    ): TItem[] {
        const merged: TItem[] = [];

        let primaryIndex: number = 0;
        let secondaryIndex: number = 0;

        while (
            primaryIndex < primary.length &&
            secondaryIndex < secondary.length
        ) {
            if (
                comparator(primary[primaryIndex], secondary[secondaryIndex]) <=
                0
            ) {
                merged.push(primary[primaryIndex]);

                primaryIndex++;

                continue;
            }

            merged.push(secondary[secondaryIndex]);

            secondaryIndex++;
        }

        return [
            ...merged,
            ...primary.slice(primaryIndex),
            ...secondary.slice(secondaryIndex),
        ];
    }

    public static slice<TItem>(
        items: TItem[],
        pagination?: Pagination,
    ): TItem[] {
        const offset: number = pagination?.offset ?? 0;
        const limit: number | undefined = pagination?.limit;

        return items.slice(
            offset,
            limit === undefined ? undefined : offset + limit,
        );
    }
}