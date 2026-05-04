/**
 * Important: This isn't pure UI pagination. It's SDK application layer pagination. It affects what data is retrieved during database queries.
 */
export interface Pagination {
    offset?: number;
    limit?: number;
}
