import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from "react";
import "./style.css";
import {
    Account,
    DEFAULT_PHLO_LIMIT,
    DEFAULT_PHLO_PRICE,
    DEPLOY_STATUS_POLLING_TIMEOUT,
    DeployStatus,
    validateDeployPayload,
    Wallet,
    type IDeployStatusResult,
    type IDeployWatchHandle,
    type SignedResult,
} from "asi-wallet-sdk";
import {
    generateDeployId,
    isDeployIdInputAllowed,
    isIntegerInputAllowed,
    toDeployIdError,
    toDeployIdLengthError,
    toErrorText,
    toIntegerRangeError,
    useSdkContext,
} from "../../sdk-react-kit";
import useSecureAction from "@hooks/useSecureAction";
import NetworkSelector from "@components/NetworkSelector";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";
import ConstrainedInput from "@components/common/ConstrainedInput";
import { copyTextToClipboard } from "@utils/misc";

const EXAMPLE_CONTRACT = `new stdout(\`rho:io:stdout\`) in {
  stdout!("Hello from ASI Wallet!")
}`;

const DEFAULT_WATCH_INTERVAL_MS: string = "5000";

const FIXED_SHARD_ID: string = "root";

const MIN_PHLO_LIMIT: number = 1;
const MAX_PHLO_LIMIT: number = Number.MAX_SAFE_INTEGER;

const MIN_WATCH_INTERVAL_MS: number = 1000;
const MAX_WATCH_INTERVAL_MS: number = 60000;

const MAX_WATCH_TIMEOUT_MS: number = 600000;

interface IAccountEntry {
    walletId: string;
    account: Account;
}

interface IWatchLogEntry {
    id: number;
    time: string;
    text: string;
}

const stringify = (value: unknown): string => JSON.stringify(value, null, 2);

const toStatusText = (status: IDeployStatusResult): string =>
    status.status === DeployStatus.CHECK_ERROR
        ? `${status.status}: ${status.errorMessage}`
        : status.status;

const DeployUtilsPage = (): ReactElement => {
    const {
        openWallets,
        currentNetwork,
        signDeploy,
        watchDeploy,
        exploreDeploy,
    } = useSdkContext();
    const runSecureAction = useSecureAction();

    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [term, setTerm] = useState<string>(EXAMPLE_CONTRACT);
    const [phloLimit, setPhloLimit] = useState<string>(
        String(DEFAULT_PHLO_LIMIT),
    );
    const [isSigning, setIsSigning] = useState<boolean>(false);
    const [signedResult, setSignedResult] = useState<SignedResult | null>(null);
    const [signError, setSignError] = useState<string | null>(null);

    const [watchedDeployId, setWatchedDeployId] = useState<string>("");
    const [watchIntervalMs, setWatchIntervalMs] = useState<string>(
        DEFAULT_WATCH_INTERVAL_MS,
    );
    const [watchTimeoutMs, setWatchTimeoutMs] = useState<string>(
        String(DEPLOY_STATUS_POLLING_TIMEOUT),
    );
    const [watchLog, setWatchLog] = useState<IWatchLogEntry[]>([]);
    const [isWatching, setIsWatching] = useState<boolean>(false);

    const [exploreCode, setExploreCode] = useState<string>(EXAMPLE_CONTRACT);
    const [exploreResult, setExploreResult] = useState<unknown>(null);
    const [exploreError, setExploreError] = useState<string | null>(null);
    const [isExploring, setIsExploring] = useState<boolean>(false);

    const watchHandleRef = useRef<IDeployWatchHandle | null>(null);
    const logIdRef = useRef<number>(0);

    useEffect(
        () => () => {
            watchHandleRef.current?.cancel();
        },
        [],
    );

    const accountEntries = useMemo<IAccountEntry[]>(
        () =>
            openWallets.flatMap((wallet: Wallet) =>
                wallet
                    .getAccounts()
                    .map((account: Account) => ({
                        walletId: wallet.getId(),
                        account,
                    })),
            ),
        [openWallets],
    );

    const accountOptions = useMemo<SelectFilterOption[]>(
        () => [
            { label: "— select account —", value: "" },
            ...accountEntries.map(({ account }: IAccountEntry) => ({
                label: `${account.getName()} (${account.getAddress()})`,
                value: account.getId(),
            })),
        ],
        [accountEntries],
    );

    const selectedEntry = useMemo<IAccountEntry | null>(
        () =>
            accountEntries.find(
                ({ account }: IAccountEntry) =>
                    account.getId() === selectedAccountId,
            ) ?? null,
        [accountEntries, selectedAccountId],
    );

    const phloLimitError: string | null = toIntegerRangeError(phloLimit, {
        label: "Phlo limit",
        min: MIN_PHLO_LIMIT,
        max: MAX_PHLO_LIMIT,
    });

    const deployPayloadError: string | null = useMemo(() => {
        const { isValid, error } = validateDeployPayload({
            term,
            phloLimit: phloLimit.trim() ? Number(phloLimit) : undefined,
            phloPrice: DEFAULT_PHLO_PRICE,
            shardId: FIXED_SHARD_ID,
        });

        return isValid ? null : (error ?? null);
    }, [term, phloLimit]);

    const watchedDeployIdError: string | null =
        toDeployIdError(watchedDeployId) ??
        toDeployIdLengthError(watchedDeployId);

    const watchIntervalError: string | null = toIntegerRangeError(
        watchIntervalMs,
        {
            label: "Interval",
            min: MIN_WATCH_INTERVAL_MS,
            max: MAX_WATCH_INTERVAL_MS,
        },
    );

    const watchTimeoutError: string | null = toIntegerRangeError(
        watchTimeoutMs,
        {
            label: "Timeout",
            min: Number(watchIntervalMs) || MIN_WATCH_INTERVAL_MS,
            max: MAX_WATCH_TIMEOUT_MS,
        },
    );

    const appendLog = (text: string): void => {
        logIdRef.current += 1;

        const entry: IWatchLogEntry = {
            id: logIdRef.current,
            time: new Date().toLocaleTimeString(),
            text,
        };

        setWatchLog((entries: IWatchLogEntry[]) => [...entries, entry]);
    };

    const stopWatch = (): void => {
        watchHandleRef.current?.cancel();
        watchHandleRef.current = null;

        setIsWatching(false);
    };

    const handleSign = async (): Promise<void> => {
        if (!selectedEntry) {
            return;
        }

        setIsSigning(true);
        setSignError(null);
        setSignedResult(null);

        try {
            const signed: SignedResult | undefined = await runSecureAction({
                walletId: selectedEntry.walletId,
                passwordTitle: "Enter wallet password to sign the deploy",
                confirmMessage: `Sign this deploy with ${selectedEntry.account.getName()}?`,
                action: (password?: string) =>
                    signDeploy(
                        {
                            walletId: selectedEntry.walletId,
                            accountId: selectedEntry.account.getId(),
                            term,
                            phloLimit: Number(phloLimit),
                            phloPrice: DEFAULT_PHLO_PRICE,
                            shardId: FIXED_SHARD_ID,
                        },
                        password,
                    ),
            });

            if (!signed) {
                setSignError("Signing cancelled");

                return;
            }

            setSignedResult(signed);
        } catch (error) {
            console.error(error);

            setSignError(toErrorText(error, "Signing failed"));
        } finally {
            setIsSigning(false);
        }
    };

    const handleWatch = (): void => {
        stopWatch();

        setWatchLog([]);
        setIsWatching(true);

        appendLog(`watching ${watchedDeployId.trim()}`);

        watchHandleRef.current = watchDeploy(
            watchedDeployId.trim(),
            {
                onStatus: (status: IDeployStatusResult) =>
                    appendLog(toStatusText(status)),
                onConfirmed: ({ blockHash }) => {
                    appendLog(
                        blockHash
                            ? `confirmed in block ${blockHash}`
                            : "confirmed",
                    );
                    setIsWatching(false);
                },
                onError: (watchError: Error) => {
                    appendLog(toErrorText(watchError, "watch failed"));
                    setIsWatching(false);
                },
            },
            {
                intervalMs: Number(watchIntervalMs),
                timeoutMs: Number(watchTimeoutMs),
            },
        );
    };

    const handleExplore = async (): Promise<void> => {
        setIsExploring(true);
        setExploreError(null);
        setExploreResult(null);

        try {
            setExploreResult(await exploreDeploy(exploreCode));
        } catch (error) {
            console.error(error);

            setExploreError(toErrorText(error, "Explore failed"));
        } finally {
            setIsExploring(false);
        }
    };

    const isSignReady =
        Boolean(selectedEntry) &&
        phloLimitError === null &&
        deployPayloadError === null;
    const isWatchReady =
        watchedDeployIdError === null &&
        watchIntervalError === null &&
        watchTimeoutError === null;

    return (
        <main className="deploy-utils-page">
            <NetworkSelector />

            <section className="deploy-utils-page__panel">
                <div className="deploy-utils-page__header">
                    <h2 className="deploy-utils-page__title">Deploy utils</h2>
                    {currentNetwork && (
                        <span className="deploy-utils-page__network">
                            {currentNetwork.name}
                        </span>
                    )}
                </div>

                <div className="deploy-utils-page__scope">
                    <p>
                        Tools that talk to the node without going through the
                        reservation flow: sign a deploy without submitting it,
                        attach to any deploy id and follow its status, and run
                        an exploratory deploy.
                    </p>
                </div>
            </section>

            <section className="deploy-utils-page__panel">
                <h3 className="deploy-utils-page__subtitle">
                    Sign deploy without submitting
                </h3>

                <p className="deploy-utils-page__hint">
                    <code>Client.signDeploy</code> returns the signed payload
                    and never sends it, so the deploy can be submitted from
                    somewhere else. Unlike <code>Client.deploy</code>, it also
                    accepts a phlo price and a shard id.
                </p>

                <p className="deploy-utils-page__hint">
                    The phlo price is pinned to {DEFAULT_PHLO_PRICE} and the
                    shard id to <code>{FIXED_SHARD_ID}</code> here. The SDK
                    passes both through as given, but at this stage the chain
                    does not finalize a deploy priced differently or aimed at
                    another shard, so such a signed payload would be rejected
                    downstream and tell nothing about the signing itself.
                </p>

                {accountEntries.length === 0 ? (
                    <p className="deploy-utils-page__empty">
                        Unlock a wallet on the Wallets page to sign a deploy.
                    </p>
                ) : (
                    <div className="deploy-utils-page__controls">
                        <div className="deploy-utils-page__field">
                            <SelectFilter
                                id="sign-account"
                                label="Account:"
                                value={selectedAccountId}
                                options={accountOptions}
                                onChange={setSelectedAccountId}
                            />
                        </div>

                        <ConstrainedInput
                            id="sign-phlo-limit"
                            label="Phlo limit:"
                            value={phloLimit}
                            onChange={setPhloLimit}
                            isAllowed={(value: string) =>
                                isIntegerInputAllowed(value, MAX_PHLO_LIMIT)
                            }
                            inputMode="numeric"
                            hint={`SDK default is ${DEFAULT_PHLO_LIMIT}`}
                            error={phloLimitError}
                        />

                        <ConstrainedInput
                            id="sign-phlo-price"
                            label="Phlo price:"
                            value={String(DEFAULT_PHLO_PRICE)}
                            hint="fixed for now, the chain does not finalize deploys with another price"
                            readOnly
                        />

                        <ConstrainedInput
                            id="sign-shard-id"
                            label="Shard id:"
                            value={FIXED_SHARD_ID}
                            hint="fixed for now, the SDK falls back to the same shard"
                            readOnly
                        />
                    </div>
                )}

                <div className="deploy-utils-page__field">
                    <label htmlFor="sign-term">Rholang code:</label>
                    <textarea
                        id="sign-term"
                        className="deploy-utils-page__editor"
                        value={term}
                        onChange={(event) => setTerm(event.target.value)}
                        disabled={isSigning}
                    />
                </div>

                {!phloLimitError && deployPayloadError && (
                    <div className="deploy-utils-page__error">
                        {deployPayloadError}
                    </div>
                )}

                <div className="deploy-utils-page__actions">
                    <button
                        type="button"
                        className="deploy-utils-page__action"
                        onClick={() => void handleSign()}
                        disabled={isSigning || !isSignReady}
                    >
                        Sign
                    </button>
                    <button
                        type="button"
                        className="deploy-utils-page__action deploy-utils-page__action--ghost"
                        onClick={() => setTerm(EXAMPLE_CONTRACT)}
                        disabled={isSigning}
                    >
                        Load example
                    </button>
                </div>

                {signError && (
                    <div className="deploy-utils-page__error">{signError}</div>
                )}

                {signedResult && (
                    <div className="deploy-utils-page__result">
                        <div className="deploy-utils-page__result-head">
                            <h4>SignedResult</h4>
                            <button
                                type="button"
                                className="deploy-utils-page__action deploy-utils-page__action--ghost"
                                onClick={() =>
                                    void copyTextToClipboard(
                                        stringify(signedResult),
                                    )
                                }
                            >
                                Copy JSON
                            </button>
                            <button
                                type="button"
                                className="deploy-utils-page__action deploy-utils-page__action--ghost"
                                onClick={() =>
                                    setWatchedDeployId(signedResult.signature)
                                }
                            >
                                Use signature as deploy id
                            </button>
                        </div>
                        <pre>{stringify(signedResult)}</pre>
                    </div>
                )}
            </section>

            <section className="deploy-utils-page__panel">
                <h3 className="deploy-utils-page__subtitle">
                    Watch a deploy by id
                </h3>

                <p className="deploy-utils-page__hint">
                    <code>Client.watchDeploy</code> polls the node of the
                    current network and needs no wallet, so any deploy id works,
                    including one produced elsewhere.
                </p>

                <div className="deploy-utils-page__controls">
                    <ConstrainedInput
                        id="watch-deploy-id"
                        label="Deploy id:"
                        value={watchedDeployId}
                        onChange={setWatchedDeployId}
                        isAllowed={isDeployIdInputAllowed}
                        error={watchedDeployId ? watchedDeployIdError : null}
                        wide
                        action={
                            <button
                                type="button"
                                className="deploy-utils-page__action deploy-utils-page__action--ghost"
                                onClick={() =>
                                    setWatchedDeployId(generateDeployId())
                                }
                            >
                                Random
                            </button>
                        }
                    />

                    <ConstrainedInput
                        id="watch-interval"
                        label="Interval, ms:"
                        value={watchIntervalMs}
                        onChange={setWatchIntervalMs}
                        isAllowed={(value: string) =>
                            isIntegerInputAllowed(value, MAX_WATCH_INTERVAL_MS)
                        }
                        inputMode="numeric"
                        hint={`${MIN_WATCH_INTERVAL_MS} to ${MAX_WATCH_INTERVAL_MS}`}
                        error={watchIntervalError}
                    />

                    <ConstrainedInput
                        id="watch-timeout"
                        label="Timeout, ms:"
                        value={watchTimeoutMs}
                        onChange={setWatchTimeoutMs}
                        isAllowed={(value: string) =>
                            isIntegerInputAllowed(value, MAX_WATCH_TIMEOUT_MS)
                        }
                        inputMode="numeric"
                        hint={`SDK default is ${DEPLOY_STATUS_POLLING_TIMEOUT}, never below the interval`}
                        error={watchTimeoutError}
                    />
                </div>

                <div className="deploy-utils-page__actions">
                    <button
                        type="button"
                        className="deploy-utils-page__action"
                        onClick={handleWatch}
                        disabled={!isWatchReady}
                    >
                        {isWatching ? "Restart watch" : "Watch"}
                    </button>
                    <button
                        type="button"
                        className="deploy-utils-page__action deploy-utils-page__action--ghost"
                        onClick={stopWatch}
                        disabled={!isWatching}
                    >
                        Cancel
                    </button>
                </div>

                {watchLog.length > 0 && (
                    <div className="deploy-utils-page__result">
                        <h4>Status log</h4>
                        <ul className="deploy-utils-page__log">
                            {watchLog.map((entry: IWatchLogEntry) => (
                                <li key={entry.id}>
                                    <span className="deploy-utils-page__log-time">
                                        {entry.time}
                                    </span>
                                    {entry.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            <section className="deploy-utils-page__panel">
                <h3 className="deploy-utils-page__subtitle">
                    Exploratory deploy
                </h3>

                <p className="deploy-utils-page__hint">
                    <code>Client.exploreDeploy</code> runs the code on the
                    read-only node and changes nothing on chain.
                </p>

                <div className="deploy-utils-page__field">
                    <label htmlFor="explore-code">Rholang code:</label>
                    <textarea
                        id="explore-code"
                        className="deploy-utils-page__editor"
                        value={exploreCode}
                        onChange={(event) => setExploreCode(event.target.value)}
                        disabled={isExploring}
                    />
                </div>

                <div className="deploy-utils-page__actions">
                    <button
                        type="button"
                        className="deploy-utils-page__action"
                        onClick={() => void handleExplore()}
                        disabled={isExploring || !exploreCode.trim()}
                    >
                        Explore
                    </button>
                </div>

                {exploreError && (
                    <div className="deploy-utils-page__error">
                        {exploreError}
                    </div>
                )}

                {exploreResult !== null && (
                    <div className="deploy-utils-page__result">
                        <h4>Explore result</h4>
                        <pre>{stringify(exploreResult)}</pre>
                    </div>
                )}
            </section>
        </main>
    );
};

export default DeployUtilsPage;
