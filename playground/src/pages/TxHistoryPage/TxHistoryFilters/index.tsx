import type { ReactElement } from "react";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";
import {
    hasActiveTransactionFilters,
    type TransactionFilter,
    type TxHistoryNetwork,
} from "../fixtures/txHistory.fixture";

interface TxHistoryFiltersProps {
    filter: TransactionFilter;
    networks: TxHistoryNetwork[];
    onFilterChange: (
        key: keyof TransactionFilter,
        value: TransactionFilter[keyof TransactionFilter] | "all" | "",
    ) => void;
    onClearFilters: () => void;
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

const TxHistoryFilters = ({
    filter,
    networks,
    onFilterChange,
    onClearFilters,
}: TxHistoryFiltersProps): ReactElement => {
    const networkOptions: SelectFilterOption[] = [
        { value: "all", label: "All Networks" },
        ...networks.map((network) => ({
            value: network.name,
            label: network.name,
        })),
    ];
    const hasActiveFilters = hasActiveTransactionFilters(filter);

    return (
        <section className="section">
            <h2>TxHistoryFilters</h2>
            <SelectFilter
                id="history-filter-type-select"
                label="Type"
                value={filter.type || "all"}
                options={typeOptions}
                onChange={(value) => onFilterChange("type", value)}
            />

            <SelectFilter
                id="history-filter-status-select"
                label="Status"
                value={filter.status || "all"}
                options={statusOptions}
                onChange={(value) => onFilterChange("status", value)}
            />

            <SelectFilter
                id="history-filter-network-select"
                label="Network"
                value={filter.network || "all"}
                options={networkOptions}
                onChange={(value) => onFilterChange("network", value)}
            />

            <label htmlFor="history-filter-start-date-input">Start Date</label>
            <input
                id="history-filter-start-date-input"
                type="date"
                value={toDateInputValue(filter.startDate)}
                onChange={(event) => {
                    onFilterChange(
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
                    onFilterChange(
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
                    onClick={onClearFilters}
                >
                    Clear Filters
                </button>
            )}
        </section>
    );
};

export default TxHistoryFilters;
