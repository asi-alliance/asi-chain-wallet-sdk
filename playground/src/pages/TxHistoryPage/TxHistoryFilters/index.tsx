import type { ReactElement } from "react";
import type {
    TransactionFilter,
    TxHistoryNetwork,
} from "../fixtures/txHistory.fixture";

interface TxHistoryFiltersProps {
    filter: TransactionFilter;
    networks: TxHistoryNetwork[];
    hasActiveFilters: boolean;
    onFilterChange: (
        key: keyof TransactionFilter,
        value: TransactionFilter[keyof TransactionFilter] | "all" | "",
    ) => void;
    onClearFilters: () => void;
}

const toDateInputValue = (date?: Date): string => {
    return date ? new Date(date).toISOString().split("T")[0] : "";
};

const TxHistoryFilters = ({
    filter,
    networks,
    hasActiveFilters,
    onFilterChange,
    onClearFilters,
}: TxHistoryFiltersProps): ReactElement => {
    return (
        <section>
            <label htmlFor="history-filter-type-select">Type</label>
            <select
                id="history-filter-type-select"
                value={filter.type || "all"}
                onChange={(event) =>
                    onFilterChange("type", event.target.value)
                }
            >
                <option value="all">All Types</option>
                <option value="send">Send</option>
                <option value="receive">Receive</option>
                <option value="deploy">Deploy</option>
            </select>

            <label htmlFor="history-filter-status-select">Status</label>
            <select
                id="history-filter-status-select"
                value={filter.status || "all"}
                onChange={(event) =>
                    onFilterChange("status", event.target.value)
                }
            >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="failed">Failed</option>
            </select>

            <label htmlFor="history-filter-network-select">Network</label>
            <select
                id="history-filter-network-select"
                value={filter.network || "all"}
                onChange={(event) =>
                    onFilterChange("network", event.target.value)
                }
            >
                <option value="all">All Networks</option>
                {networks.map((network) => (
                    <option key={network.id} value={network.name}>
                        {network.name}
                    </option>
                ))}
            </select>

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
