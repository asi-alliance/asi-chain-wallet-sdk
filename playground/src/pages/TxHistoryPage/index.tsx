import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import "./styles.css";
import { Account, Transaction } from "asi-wallet-sdk";
import { useSdkContext } from "../../sdk-react-kit";
import NetworkSelector from "@components/NetworkSelector";
import TxList from "./TxList";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";

const TxHistoryPage = (): ReactElement => {
    const { unlockedWallets, currentNetwork } = useSdkContext();

    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
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

    return (
        <main className="tx-history-page">
            <NetworkSelector />
            <h1>Transactions</h1>

            {accounts.length === 0 ? (
                <p>
                    Unlock a wallet on the Wallets page to view its transaction
                    history.
                </p>
            ) : (
                <section className="section">
                    <SelectFilter
                        id="tx-account"
                        label="Account:"
                        value={selectedAccountId}
                        options={accountOptions}
                        onChange={setSelectedAccountId}
                    />
                </section>
            )}

            {isLoading ? (
                <p>Loading transactions...</p>
            ) : (
                <TxList transactions={transactions} />
            )}
        </main>
    );
};

export default TxHistoryPage;
