import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import "./style.css";
import {
    Account,
    DEFAULT_PHLO_PRICE,
    IDeployWatchHandle,
    Wallet,
} from "asi-wallet-sdk";
import { useSdkContext } from "../../sdk-react-kit";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";
import NetworkSelector from "@components/NetworkSelector";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";

const EXAMPLE_CONTRACT = `new stdout(\`rho:io:stdout\`), deployerId(\`rho:rchain:deployerId\`) in {
  stdout!("Hello from ASI Wallet!") |
  deployerId!("Deploy successful")
}`;

const DEFAULT_PHLO_LIMIT = "100000000";

interface IAccountEntry {
    walletId: string;
    account: Account;
}

const stringify = (value: unknown): string =>
    JSON.stringify(
        value,
        (_key, item) => (typeof item === "bigint" ? item.toString() : item),
        2,
    );

const DeployPage = (): ReactElement => {
    const {
        unlockedWallets,
        currentNetwork,
        deploy,
        exploreDeploy,
        watchDeploy,
        getAvailableBalance,
    } = useSdkContext();
    const { setModalState } = useAppContext();

    const [code, setCode] = useState<string>(EXAMPLE_CONTRACT);
    const [phloLimit, setPhloLimit] = useState<string>(DEFAULT_PHLO_LIMIT);
    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<unknown>(null);
    const [deployId, setDeployId] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    const watchHandleRef = useRef<IDeployWatchHandle | null>(null);

    useEffect(
        () => () => {
            watchHandleRef.current?.cancel();
        },
        [],
    );

    const selectedWalletId: string = useMemo(() => {
        for (const wallet of unlockedWallets) {
            if (
                !wallet
                    .getAccounts()
                    .some(
                        (account: Account) =>
                            account.getId() === selectedAccountId,
                    )
            ) {
                continue;
            }

            return wallet.getId();
        }
    }, [unlockedWallets, selectedAccountId]);
    const accountEntries = useMemo<IAccountEntry[]>(
        () =>
            unlockedWallets.flatMap((wallet: Wallet) =>
                wallet
                    .getAccounts()
                    .map((account) => ({ walletId: wallet.getId(), account })),
            ),
        [unlockedWallets],
    );

    const accountOptions = useMemo<SelectFilterOption[]>(
        () => [
            { label: "— select account —", value: "" },
            ...accountEntries.map(({ account }) => ({
                label: `${account.getName()} (${account.getAddress()})`,
                value: account.getId(),
            })),
        ],
        [accountEntries],
    );

    const selectedEntry = useMemo<IAccountEntry | null>(
        () =>
            accountEntries.find(
                ({ account }) => account.getId() === selectedAccountId,
            ) ?? null,
        [accountEntries, selectedAccountId],
    );

    const resetOutput = (): void => {
        setError(null);
        setResult(null);
        setDeployId(null);
        setStatus(null);
        watchHandleRef.current?.cancel();
        watchHandleRef.current = null;
    };

    const runDeploy = async (password: string): Promise<void> => {
        if (!selectedEntry) {
            return;
        }

        setIsLoading(true);
        resetOutput();

        const parsedPhloLimit: number | undefined = phloLimit.trim()
            ? Number(phloLimit)
            : undefined;

        if (
            parsedPhloLimit !== undefined &&
            !Number.isFinite(parsedPhloLimit)
        ) {
            setError("Phlo limit must be a number");
            setIsLoading(false);

            return;
        }

        const balance = await getAvailableBalance(
            selectedWalletId,
            selectedAccountId,
        );
        const minGasCost =
            (Number(phloLimit) * DEFAULT_PHLO_PRICE) / 1000000000;
        if (balance <= 0 || balance < minGasCost) {
            setError("Transaction aborted: Insufficient balance");
            setIsLoading(false);

            return;
        }

        try {
            const submittedDeployId: string = await deploy(
                {
                    walletId: selectedEntry.walletId,
                    accountId: selectedEntry.account.getId(),
                    term: code,
                    phloLimit: parsedPhloLimit,
                },
                password,
            );

            setDeployId(submittedDeployId);
            setStatus("Submitted");

            watchHandleRef.current = watchDeploy(submittedDeployId, {
                onStatus: (deployStatus) => setStatus(deployStatus.status),
                onConfirmed: () => setStatus("Finalized"),
                onError: (watchError) => setError(watchError.message),
            });
        } catch (deployError) {
            setError((deployError as Error)?.message ?? "Deploy failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeployClick = (): void => {
        if (!selectedEntry || !code.trim()) {
            return;
        }

        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Enter wallet password to deploy",
                onSubmit: (password: string) => {
                    setModalState({ type: null });
                    void runDeploy(password);
                },
                onClose: () => setModalState({ type: null }),
            },
        });
    };

    const handleExplore = async (): Promise<void> => {
        if (!code.trim()) {
            return;
        }

        setIsLoading(true);
        resetOutput();

        try {
            const exploredDeploy = await exploreDeploy(code);

            console.log("EXPLORED DEPLOY: ", exploredDeploy);

            setResult(await exploreDeploy(code));
        } catch (exploreError) {
            setError((exploreError as Error)?.message ?? "Explore failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="deploy-page">
            <NetworkSelector />
            <h1>Deploy</h1>

            {accountEntries.length === 0 ? (
                <p>
                    Unlock a wallet on the Wallets page to deploy a Rholang
                    contract.
                </p>
            ) : (
                <section className="section">
                    <SelectFilter
                        id="deploy-account"
                        label="Account:"
                        value={selectedAccountId}
                        options={accountOptions}
                        onChange={setSelectedAccountId}
                    />
                </section>
            )}

            <section className="section deploy-page__field">
                <label htmlFor="deploy-phlo-limit">Phlo limit:</label>
                <input
                    id="deploy-phlo-limit"
                    type="number"
                    value={phloLimit}
                    onChange={(event) => setPhloLimit(event.target.value)}
                />
            </section>

            <section className="section deploy-page__field">
                <label htmlFor="deploy-code">Rholang code:</label>
                <textarea
                    id="deploy-code"
                    className="deploy-page__editor"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Enter your Rholang code here..."
                    disabled={isLoading}
                />
            </section>

            <div className="deploy-page__actions">
                <button
                    type="button"
                    onClick={handleDeployClick}
                    disabled={isLoading || !code.trim() || !selectedEntry}
                >
                    Deploy
                </button>
                <button
                    type="button"
                    onClick={() => void handleExplore()}
                    disabled={isLoading || !code.trim()}
                >
                    Explore
                </button>
                <button
                    type="button"
                    onClick={() => setCode(EXAMPLE_CONTRACT)}
                    disabled={isLoading}
                >
                    Load example
                </button>
                <button
                    type="button"
                    onClick={() => setCode("")}
                    disabled={isLoading}
                >
                    Clear
                </button>
            </div>

            {isLoading && <p>Working...</p>}

            {error && <div className="deploy-page__error">{error}</div>}

            {deployId && (
                <div className="deploy-page__success">
                    <div>Deploy submitted successfully!</div>
                    <div className="deploy-page__deploy-id">
                        Deploy ID: {deployId}
                    </div>
                    {status && <div>Status: {status}</div>}
                </div>
            )}

            {result !== null && (
                <div className="deploy-page__result">
                    <h4>Explore result</h4>
                    <pre>{stringify(result)}</pre>
                </div>
            )}

            {currentNetwork && (
                <p className="deploy-page__network-hint">
                    Network: {currentNetwork.name}
                </p>
            )}
        </main>
    );
};

export default DeployPage;
