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
    THistorySource,
    Transaction,
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

type HistoryMode = "all" | "pending" | "executed";

const MODE_OPTIONS: SelectFilterOption[] = [
    { label: "All", value: "all" },
    { label: "Pending only", value: "pending" },
    { label: "Executed only", value: "executed" },
];

const MODE_SOURCES: Record<HistoryMode, THistorySource[] | undefined> = {
    all: undefined,
    pending: ["pending"],
    executed: ["executed"],
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
    const [historyMode, setHistoryMode] = useState<HistoryMode>("all");
    const [exportFormat, setExportFormat] = useState<ExportFormat>(
        ExportFormat.JSON,
    );
    const [transactions, setTransactions] = useState<Transaction[] | null>(
        null,
    );
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
            const loadedTransactions: Transaction[] =
                await client.getTransactionsHistory(
                    selectedWallet.getId(),
                    selectedAccount.getId(),
                    {
                        sources: MODE_SOURCES[historyMode],
                        pagination: {
                            offset: (page - 1) * PAGE_SIZE,
                            limit: PAGE_SIZE,
                        },
                    },
                );

            if (!isResultRelevant()) {
                return;
            }

            setTransactions(loadedTransactions);
        } catch (error) {
            console.error(error);

            if (!isResultRelevant()) {
                return;
            }

            setTransactions(null);
        } finally {
            setIsLoading(false);
        }
    }, [
        client,
        selectedWallet,
        selectedAccount,
        historyMode,
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

    const handleModeChange = (value: string): void => {
        setHistoryMode(value as HistoryMode);
        resetToFirstPage();
    };

    const hasNextPage = transactions?.length === PAGE_SIZE;

    const showPagination = Boolean(transactions) && (page > 1 || hasNextPage);

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
                                id="tx-mode"
                                label="Show:"
                                value={historyMode}
                                options={MODE_OPTIONS}
                                onChange={handleModeChange}
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
                        hasNextPage={hasNextPage}
                        onChange={goToPage}
                    />
                )}
            </section>
        </main>
    );
};

export default TxHistoryPage;
