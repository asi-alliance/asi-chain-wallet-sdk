import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import "./style.css";
import {
    Account,
    DEFAULT_PHLO_LIMIT,
    DEFAULT_PHLO_PRICE,
    DeployStatus,
    IReservedOperationResult,
    validateDeployPayload,
    Wallet,
} from "asi-wallet-sdk";
import {
    formatAssetAmount,
    toErrorText,
    useSdkContext,
} from "../../sdk-react-kit";
import {
    useRelevantResultGuard,
    type TIsResultRelevant,
    type TStartRequest,
} from "../../sdk-react-kit/hooks/useRelevantResultGuard";
import useSecureAction from "@hooks/useSecureAction";
import NetworkSelector from "@components/NetworkSelector";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";

const EXAMPLE_CONTRACT = `new stdout(\`rho:io:stdout\`), deployerId(\`rho:rchain:deployerId\`) in {
  stdout!("Hello from ASI Wallet!") |
  deployerId!("Deploy successful")
}`;

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
        openWallets,
        currentNetwork,
        deploy,
        exploreDeploy,
        getAvailableBalance,
    } = useSdkContext();
    const runSecureAction = useSecureAction();
    const startRequest: TStartRequest = useRelevantResultGuard(
        currentNetwork?.id,
    );

    const [code, setCode] = useState<string>(EXAMPLE_CONTRACT);
    const [phloLimit, setPhloLimit] = useState<string>(
        String(DEFAULT_PHLO_LIMIT),
    );
    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<unknown>(null);
    const [deployId, setDeployId] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    const unsubscribeRef = useRef<(() => void) | null>(null);

    useEffect(
        () => () => {
            unsubscribeRef.current?.();
        },
        [],
    );

    const accountEntries = useMemo<IAccountEntry[]>(
        () =>
            openWallets.flatMap((wallet: Wallet) =>
                wallet
                    .getAccounts()
                    .map((account) => ({ walletId: wallet.getId(), account })),
            ),
        [openWallets],
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
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
    };

    const runDeploy = async (): Promise<void> => {
        if (!selectedEntry) {
            return;
        }

        setIsLoading(true);
        resetOutput();

        try {
            const parsedPhloLimit: number | undefined = phloLimit.trim()
                ? Number(phloLimit)
                : undefined;

            const { isValid, error: payloadError } = validateDeployPayload({
                term: code,
                phloLimit: parsedPhloLimit,
            });

            if (!isValid) {
                setError(payloadError);

                return;
            }

            const isBalanceRelevant: TIsResultRelevant = startRequest();

            let balance: bigint;

            try {
                balance = await getAvailableBalance(
                    selectedEntry.walletId,
                    selectedEntry.account.getId(),
                );
            } catch (balanceError) {
                if (!isBalanceRelevant()) {
                    return;
                }

                setError(
                    toErrorText(balanceError, "Deploy aborted: balance is unavailable"),
                );

                return;
            }

            if (!isBalanceRelevant()) {
                setError("Deploy aborted: network changed");

                return;
            }

            const reservedGasCost: bigint =
                BigInt(parsedPhloLimit ?? DEFAULT_PHLO_LIMIT) *
                BigInt(DEFAULT_PHLO_PRICE);

            if (balance < reservedGasCost) {
                setError(
                    `Transaction aborted: Insufficient balance, the deploy reserves ${formatAssetAmount(
                        reservedGasCost,
                    )}`,
                );

                return;
            }

            const reserved: IReservedOperationResult | undefined =
                await runSecureAction({
                    walletId: selectedEntry.walletId,
                    passwordTitle: "Enter wallet password to deploy",
                    confirmMessage: `Deploy this contract from ${selectedEntry.account.getName()}?`,
                    action: (password?: string) =>
                        deploy(
                            {
                                walletId: selectedEntry.walletId,
                                accountId: selectedEntry.account.getId(),
                                term: code,
                                phloLimit: parsedPhloLimit,
                            },
                            password,
                        ),
                });

            if (!reserved) {
                return;
            }

            setDeployId(reserved.deployId);
            setStatus(DeployStatus.DEPLOYING);

            unsubscribeRef.current = reserved.subscribe({
                onStatus: (deployStatus) => setStatus(deployStatus.status),
                onConfirmed: () => setStatus(DeployStatus.FINALIZED),
                onError: (watchError) =>
                    setError(toErrorText(watchError, "Deploy watch failed")),
            });
        } catch (deployError) {
            setError(toErrorText(deployError, "Deploy failed"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeployClick = (): void => {
        if (!selectedEntry || !code.trim()) {
            return;
        }

        void runDeploy();
    };

    const handleExplore = async (): Promise<void> => {
        if (!code.trim()) {
            return;
        }

        const isResultRelevant: TIsResultRelevant = startRequest();

        setIsLoading(true);
        resetOutput();

        try {
            const exploreResult: unknown = await exploreDeploy(code);

            if (!isResultRelevant()) {
                return;
            }

            setResult(exploreResult);
        } catch (exploreError) {
            if (!isResultRelevant()) {
                return;
            }

            setError(toErrorText(exploreError, "Explore failed"));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="deploy-page">
            <NetworkSelector />

            <section className="deploy-page__panel">
                <div className="deploy-page__header">
                    <h2 className="deploy-page__title">Deploy</h2>
                    {currentNetwork && (
                        <span className="deploy-page__network">
                            {currentNetwork.name}
                        </span>
                    )}
                </div>

                {accountEntries.length === 0 ? (
                    <p className="deploy-page__empty">
                        Unlock a wallet on the Wallets page to deploy a Rholang
                        contract.
                    </p>
                ) : (
                    <div className="deploy-page__controls">
                        <div className="deploy-page__field">
                            <SelectFilter
                                id="deploy-account"
                                label="Account:"
                                value={selectedAccountId}
                                options={accountOptions}
                                onChange={setSelectedAccountId}
                            />
                        </div>
                        <div className="deploy-page__field">
                            <label htmlFor="deploy-phlo-limit">
                                Phlo limit:
                            </label>
                            <input
                                id="deploy-phlo-limit"
                                type="number"
                                value={phloLimit}
                                onChange={(event) =>
                                    setPhloLimit(event.target.value)
                                }
                            />
                        </div>
                    </div>
                )}
            </section>

            <section className="deploy-page__panel">
                <div className="deploy-page__field">
                    <label htmlFor="deploy-code">Rholang code:</label>
                    <textarea
                        id="deploy-code"
                        className="deploy-page__editor"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder="Enter your Rholang code here..."
                        disabled={isLoading}
                    />
                </div>

                <div className="deploy-page__actions">
                    <button
                        type="button"
                        className="deploy-page__action"
                        onClick={handleDeployClick}
                        disabled={isLoading || !code.trim() || !selectedEntry}
                    >
                        Deploy
                    </button>
                    <button
                        type="button"
                        className="deploy-page__action deploy-page__action--ghost"
                        onClick={() => void handleExplore()}
                        disabled={isLoading || !code.trim()}
                    >
                        Explore
                    </button>
                    <button
                        type="button"
                        className="deploy-page__action deploy-page__action--ghost"
                        onClick={() => setCode(EXAMPLE_CONTRACT)}
                        disabled={isLoading}
                    >
                        Load example
                    </button>
                    <button
                        type="button"
                        className="deploy-page__action deploy-page__action--ghost"
                        onClick={() => setCode("")}
                        disabled={isLoading}
                    >
                        Clear
                    </button>
                </div>

                {isLoading && (
                    <p className="deploy-page__working">Working...</p>
                )}

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
            </section>
        </main>
    );
};

export default DeployPage;
