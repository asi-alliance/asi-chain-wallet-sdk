import type { ReactElement } from "react";
import "./style.css";

const VISIBLE_PAGES: number = 5;

interface PaginationProps {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
}

const buildPageNumbers = (page: number, totalPages: number): number[] => {
    const visiblePages = Math.min(VISIBLE_PAGES, totalPages);

    const firstPage = Math.min(
        Math.max(1, page - Math.floor(visiblePages / 2)),
        totalPages - visiblePages + 1,
    );

    return Array.from(
        { length: visiblePages },
        (_, index) => firstPage + index,
    );
};

const Pagination = ({
    page,
    totalPages,
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

            {buildPageNumbers(page, totalPages).map((pageNumber) => (
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
                disabled={page >= totalPages}
                aria-label="Next page"
            >
                ›
            </button>
        </nav>
    );
};

export default Pagination;