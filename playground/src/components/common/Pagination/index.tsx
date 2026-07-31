import type { ReactElement } from "react";
import "./style.css";

const VISIBLE_PAGES: number = 5;

interface PaginationProps {
    page: number;
    hasNextPage: boolean;
    onChange: (page: number) => void;
}

const buildPageNumbers = (page: number, hasNextPage: boolean): number[] => {
    const lastKnownPage = hasNextPage ? page + 1 : page;
    const firstPage = Math.max(1, lastKnownPage - VISIBLE_PAGES + 1);

    return Array.from(
        { length: lastKnownPage - firstPage + 1 },
        (_, index) => firstPage + index,
    );
};

const Pagination = ({
    page,
    hasNextPage,
    onChange,
}: PaginationProps): ReactElement => {
    return (
        <nav className="pagination" aria-label="History pages">
            <button
                type="button"
                className="pagination__arrow"
                onClick={() => onChange(page - 1)}
                disabled={page === 1}
                aria-label="Previous page"
            >
                ‹
            </button>

            {buildPageNumbers(page, hasNextPage).map((pageNumber) => (
                <button
                    key={pageNumber}
                    type="button"
                    className={`pagination__page ${
                        pageNumber === page ? "pagination__page--active" : ""
                    }`}
                    onClick={() => onChange(pageNumber)}
                    aria-current={pageNumber === page ? "page" : undefined}
                >
                    {pageNumber}
                </button>
            ))}

            <button
                type="button"
                className="pagination__arrow"
                onClick={() => onChange(page + 1)}
                disabled={!hasNextPage}
                aria-label="Next page"
            >
                ›
            </button>
        </nav>
    );
};

export default Pagination;