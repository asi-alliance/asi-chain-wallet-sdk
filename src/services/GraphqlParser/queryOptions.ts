/**
 * Important: This isn't pure UI pagination. It's SDK application layer pagination. It affects what data is retrieved during database queries.
 */
export type Pagination = Partial<{
    offset: number;
    limit: number;
}>;
export type Order = "asc" | "desc";

/**
 * frequently encountered query options
 */
export type QueryOptions = Partial<{
    pagination: Pagination;
    order: Order;
}>;

export const DEFAULT_HISTORY_LIMIT: number = 100;
export const DEFAULT_HISTORY_ORDER: Order = "desc";