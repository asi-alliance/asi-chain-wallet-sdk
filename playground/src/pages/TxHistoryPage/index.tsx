import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import { useSearchParams } from "react-router-dom";
import "./styles.css";
import {
    Account,
    ExportFormat,
    ExportService,
    ITransactionsHistoryFilters,
    ITransactionsHistoryPage,
    THistorySource,
    Transaction,
    TransactionType,
    TTransactionStatusFilter,
} from "asi-wallet-sdk";
import { useSdkContext } from "../../sdk-react-kit";
import {
    useRelevantResultGuard,
    type TIsResultRelevant,
    type TStartRequest,
} from "../../sdk-react-kit/hooks/useRelevantResultGuard";
import NetworkSelector from "@components/NetworkSelector";
import TxList from "./TxList";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";
import Pagination from "@components/common/Pagination";
import { downloadTextFile } from "@utils/functions";

const PAGE_SIZE: number = 10;

const PAGE_QUERY_PARAM: string = "page";

type TypeFilter = TransactionType | "all";
type StatusFilter = TTransactionStatusFilter | "pending" | "all";
type PeriodFilter = "day" | "week" | "month" | "all";

const TYPE_OPTIONS: SelectFilterOption[] = [
    { label: "All types", value: "all" },
    { label: "Send", value: "send" },
    { label: "Receive", value: "receive" },
    { label: "Deploy", value: "deploy" },
];

const STATUS_OPTIONS: SelectFilterOption[] = [
    { label: "All statuses", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Confirmed", value: "completed" },
    { label: "Failed", value: "failed" },
];

const STATUS_SOURCES: Record<StatusFilter, THistorySource[] | undefined> = {
    all: undefined,
    pending: ["pending"],
    completed: ["executed"],
    failed: ["executed"],
};

const PERIOD_OPTIONS: SelectFilterOption[] = [
    { label: "All time", value: "all" },
    { label: "1 day", value: "day" },
    { label: "1 week", value: "week" },
    { label: "1 month", value: "month" },
];

const DAY_MS: number = 24 * 60 * 60 * 1000;

const PERIOD_DURATIONS: Record<Exclude<PeriodFilter, "all">, number> = {
    day: DAY_MS,
    week: 7 * DAY_MS,
    month: 30 * DAY_MS,
};

const buildFilters = (
    type: TypeFilter,
    status: StatusFilter,
    period: PeriodFilter,
): ITransactionsHistoryFilters => {
    const filters: ITransactionsHistoryFilters = {};

    if (type !== "all") {
        filters.type = type;
    }

    if (status !== "all" && status !== "pending") {
        filters.status = status;
    }

    if (period !== "all") {
        filters.period = {
            from: new Date(Date.now() - PERIOD_DURATIONS[period]),
        };
    }

    return filters;
};

const FORMAT_OPTIONS: SelectFilterOption[] = [
    { label: "JSON", value: ExportFormat.JSON },
    { label: "CSV", value: ExportFormat.CSV },
];

const FORMAT_MIME: Record<ExportFormat, string> = {
    [ExportFormat.JSON]: "application/json",
    [ExportFormat.CSV]: "text/csv",
};

const TxHistoryPage = (): ReactElement => {
    const { client, unlockedWallets, currentNetwork, reservationsByWallet } =
        useSdkContext();

    const [searchParams, setSearchParams] = useSearchParams();

    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
    const [exportFormat, setExportFormat] = useState<ExportFormat>(
        ExportFormat.JSON,
    );
    const [transactions, setTransactions] = useState<Transaction[] | null>(
        null,
    );
    const [totalTransactions, setTotalTransactions] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const page = Math.max(1, Number(searchParams.get(PAGE_QUERY_PARAM)) || 1);

    const accounts = useMemo<Account[]>(
        () => unlockedWallets.flatMap((wallet) => wallet.getAccounts()),
        [unlockedWallets],
    );

    const accountOptions = useMemo<SelectFilterOption[]>(
        () => [
            { label: "— select account —", value: "" },
            ...accounts.map((account) => ({
                label: `${account.getName()} (${account.getAddress()})`,
                value: account.getId(),
            })),
        ],
        [accounts],
    );

    const selectedAccount = useMemo(
        () =>
            accounts.find((account) => account.getId() === selectedAccountId) ??
            null,
        [accounts, selectedAccountId],
    );

    const selectedWallet = useMemo(
        () =>
            unlockedWallets.find((wallet) =>
                wallet.getAccountsMap().has(selectedAccountId),
            ) ?? null,
        [unlockedWallets, selectedAccountId],
    );

    const startRequest: TStartRequest = useRelevantResultGuard(
        currentNetwork?.id,
    );

    const load = useCallback(async (): Promise<void> => {
        if (!client || !selectedWallet || !selectedAccount) {
            setTransactions(null);

            return;
        }

        const isResultRelevant: TIsResultRelevant = startRequest();

        setIsLoading(true);

        try {
            const loadedPage: ITransactionsHistoryPage =
                await client.getTransactionsHistory(
                    selectedWallet.getId(),
                    selectedAccount.getId(),
                    {
                        sources: STATUS_SOURCES[statusFilter],
                        pagination: {
                            offset: (page - 1) * PAGE_SIZE,
                            limit: PAGE_SIZE,
                        },
                        filters: buildFilters(
                            typeFilter,
                            statusFilter,
                            periodFilter,
                        ),
                    },
                );

            if (!isResultRelevant()) {
                return;
            }

            setTransactions(loadedPage.items);
            setTotalTransactions(loadedPage.total);
        } catch (error) {
            console.error(error);

            if (!isResultRelevant()) {
                return;
            }

            setTransactions(null);
            setTotalTransactions(0);
        } finally {
            setIsLoading(false);
        }
    }, [
        client,
        selectedWallet,
        selectedAccount,
        typeFilter,
        statusFilter,
        periodFilter,
        page,
        startRequest,
    ]);

    const walletReservations = selectedWallet
        ? reservationsByWallet[selectedWallet.getId()]
        : undefined;

    useEffect(() => {
        void load();
    }, [load, currentNetwork, walletReservations]);

    const goToPage = (nextPage: number): void => {
        const params = new URLSearchParams(searchParams);

        params.set(PAGE_QUERY_PARAM, String(nextPage));

        setSearchParams(params);
    };

    const resetToFirstPage = (): void => {
        const params = new URLSearchParams(searchParams);

        params.delete(PAGE_QUERY_PARAM);

        setSearchParams(params, { replace: true });
    };

    const handleAccountChange = (value: string): void => {
        setSelectedAccountId(value);
        resetToFirstPage();
    };

    const handleTypeChange = (value: string): void => {
        setTypeFilter(value as TypeFilter);
        resetToFirstPage();
    };

    const handleStatusChange = (value: string): void => {
        setStatusFilter(value as StatusFilter);
        resetToFirstPage();
    };

    const handlePeriodChange = (value: string): void => {
        setPeriodFilter(value as PeriodFilter);
        resetToFirstPage();
    };

    const totalPages = Math.ceil(totalTransactions / PAGE_SIZE);

    const showPagination = Boolean(transactions) && totalPages > 1;

    const canExport = Boolean(
        selectedAccount && transactions && transactions.length,
    );

    const handleExport = (): void => {
        if (!selectedAccount || !transactions) {
            return;
        }

        const content = ExportService.exportTransactions(
            transactions,
            exportFormat,
        );

        downloadTextFile(
            `transactions-${selectedAccount.getName()}.${exportFormat}`,
            content,
            FORMAT_MIME[exportFormat],
        );
    };

    return (
        <main className="tx-history-page">
            <NetworkSelector />

            <section className="tx-history-page__panel">
                <div className="tx-history-page__header">
                    <h2 className="tx-history-page__title">Transactions</h2>
                    {currentNetwork && (
                        <span className="tx-history-page__network">
                            {currentNetwork.name}
                        </span>
                    )}
                </div>

                {accounts.length === 0 ? (
                    <p className="tx-history-page__empty">
                        Unlock a wallet on the Wallets page to view its
                        transaction history.
                    </p>
                ) : (
                    <div className="tx-history-page__controls">
                        <div className="tx-history-page__field">
                            <SelectFilter
                                id="tx-account"
                                label="Account:"
                                value={selectedAccountId}
                                options={accountOptions}
                                onChange={handleAccountChange}
                            />
                        </div>
                        <div className="tx-history-page__field">
                            <SelectFilter
                                id="tx-type"
                                label="Type:"
                                value={typeFilter}
                                options={TYPE_OPTIONS}
                                onChange={handleTypeChange}
                            />
                        </div>
                        <div className="tx-history-page__field">
                            <SelectFilter
                                id="tx-status"
                                label="Status:"
                                value={statusFilter}
                                options={STATUS_OPTIONS}
                                onChange={handleStatusChange}
                            />
                        </div>
                        <div className="tx-history-page__field">
                            <SelectFilter
                                id="tx-period"
                                label="Period:"
                                value={periodFilter}
                                options={PERIOD_OPTIONS}
                                onChange={handlePeriodChange}
                            />
                        </div>
                        <div className="tx-history-page__field">
                            <SelectFilter
                                id="tx-format"
                                label="Format:"
                                value={exportFormat}
                                options={FORMAT_OPTIONS}
                                onChange={(value) =>
                                    setExportFormat(value as ExportFormat)
                                }
                            />
                        </div>
                        <button
                            type="button"
                            className="tx-history-page__action"
                            onClick={handleExport}
                            disabled={!canExport}
                        >
                            Export
                        </button>
                        <button
                            type="button"
                            className="tx-history-page__action tx-history-page__action--ghost"
                            onClick={() => void load()}
                            disabled={!selectedAccount || isLoading}
                        >
                            Reload
                        </button>
                    </div>
                )}
            </section>

            <section className="tx-history-page__panel">
                {isLoading ? (
                    <p className="tx-history-page__empty">
                        Loading transactions...
                    </p>
                ) : (
                    <TxList transactions={transactions} />
                )}

                {showPagination && (
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        onChange={goToPage}
                    />
                )}
            </section>
        </main>
    );
};

export default TxHistoryPage;
