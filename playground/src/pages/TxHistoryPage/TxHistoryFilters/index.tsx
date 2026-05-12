import type { ReactElement } from "react";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";
import {TransactionFilter, hasActiveTransactionFilters } from "asi-wallet-sdk"

interface TxHistoryFiltersProps {
    filter: TransactionFilter;
    // networks: Network[];
    onFilterChange: (filter: TransactionFilter) => void;
}

const toDateInputValue = (date?: Date): string => {
    return date ? new Date(date).toISOString().split("T")[0] : "";
};

const typeOptions: SelectFilterOption[] = [
    { value: "all", label: "All Types" },
    { value: "send", label: "Send" },
    { value: "receive", label: "Receive" },
    { value: "deploy", label: "Deploy" },
];

const statusOptions: SelectFilterOption[] = [
    { value: "all", label: "All Status" },
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "failed", label: "Failed" },
];

const normalizeFilterValue = (
    value: TransactionFilter[keyof TransactionFilter] | "all" | "",
): TransactionFilter[keyof TransactionFilter] | undefined => {
    return value === "all" || value === "" ? undefined : value;
};

const TxHistoryFilters = ({
    filter,
    // networks,
    onFilterChange,
}: TxHistoryFiltersProps): ReactElement => {
    // const networkOptions: SelectFilterOption[] = [
    //     { value: "all", label: "All Networks" },
    //     ...(networks ?? []).map((network) => ({
    //         value: network.name,
    //         label: network.name,
    //     })),
    // ];
    const hasActiveFilters = hasActiveTransactionFilters(filter);

    const handleFilterChange = (
        key: keyof TransactionFilter,
        value: TransactionFilter[keyof TransactionFilter] | "all" | "",
    ) => {
        const nextFilter = {
            ...filter,
            [key]: normalizeFilterValue(value),
        };

        Object.keys(nextFilter).forEach((filterKey) => {
            const typedFilterKey = filterKey as keyof TransactionFilter;

            if (!nextFilter[typedFilterKey]) {
                delete nextFilter[typedFilterKey];
            }
        });

        onFilterChange(nextFilter);
    };

    const handleClearFilters = () => {
        onFilterChange({});
    };

    return (
        <section className="section">
            <h2>TxHistoryFilters</h2>
            <SelectFilter
                id="history-filter-type-select"
                label="Type"
                value={filter.type || "all"}
                options={typeOptions}
                onChange={(value) => handleFilterChange("type", value)}
            />

            <SelectFilter
                id="history-filter-status-select"
                label="Status"
                value={filter.status || "all"}
                options={statusOptions}
                onChange={(value) => handleFilterChange("status", value)}
            />

            {/* <SelectFilter
                id="history-filter-network-select"
                label="Network"
                value={filter.network || "all"}
                options={networkOptions}
                onChange={(value) => handleFilterChange("network", value)}
            /> */}

            <label htmlFor="history-filter-start-date-input">Start Date</label>
            <input
                id="history-filter-start-date-input"
                type="date"
                value={toDateInputValue(filter.startDate)}
                onChange={(event) => {
                    handleFilterChange(
                        "startDate",
                        event.target.value
                            ? new Date(`${event.target.value}T00:00:00`)
                            : undefined,
                    );
                }}
            />

            <label htmlFor="history-filter-end-date-input">End Date</label>
            <input
                id="history-filter-end-date-input"
                type="date"
                value={toDateInputValue(filter.endDate)}
                onChange={(event) => {
                    handleFilterChange(
                        "endDate",
                        event.target.value
                            ? new Date(`${event.target.value}T23:59:59`)
                            : undefined,
                    );
                }}
            />

            {hasActiveFilters && (
                <button
                    id="history-clear-filters-button"
                    type="button"
                    onClick={handleClearFilters}
                >
                    Clear Filters
                </button>
            )}
        </section>
    );
};

export default TxHistoryFilters;
