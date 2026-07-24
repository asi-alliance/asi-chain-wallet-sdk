import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import "./styles.css";
import {
    Account,
    ExportFormat,
    ExportService,
    Transaction,
} from "asi-wallet-sdk";
import { useSdkContext } from "../../sdk-react-kit";
import NetworkSelector from "@components/NetworkSelector";
import TxList from "./TxList";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";
import { downloadTextFile } from "@utils/functions";

const FORMAT_OPTIONS: SelectFilterOption[] = [
    { label: "JSON", value: ExportFormat.JSON },
    { label: "CSV", value: ExportFormat.CSV },
];

const FORMAT_MIME: Record<ExportFormat, string> = {
    [ExportFormat.JSON]: "application/json",
    [ExportFormat.CSV]: "text/csv",
};

const TxHistoryPage = (): ReactElement => {
    const { unlockedWallets, currentNetwork } = useSdkContext();

    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [exportFormat, setExportFormat] = useState<ExportFormat>(
        ExportFormat.JSON,
    );
    const [transactions, setTransactions] = useState<Transaction[] | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState<boolean>(false);

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

    const load = useCallback(async (account: Account): Promise<void> => {
        setIsLoading(true);

        try {
            setTransactions(await account.getTransactionsHistory());
        } catch (error) {
            console.error(error);
            setTransactions(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedAccount) {
            void load(selectedAccount);
        } else {
            setTransactions(null);
        }
    }, [selectedAccount, currentNetwork, load]);

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
                                onChange={setSelectedAccountId}
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
                            onClick={() =>
                                selectedAccount && void load(selectedAccount)
                            }
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
            </section>
        </main>
    );
};

export default TxHistoryPage;