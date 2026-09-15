import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
    type ReactElement,
} from "react";
import "./style.css";
import {
    Account,
    DEFAULT_ASSET,
    getErrorMessage,
    Wallet,
    type ITransactionReservation,
    type TTransactionReservationMeta,
    type TTransactionReservationRequest,
    type TransactionReservationKind,
} from "asi-wallet-sdk";
import {
    formatAddress,
    formatAmount,
    formatAssetAmount,
    useSdkContext,
} from "../../sdk-react-kit";
import useSecureAction from "@hooks/useSecureAction";
import NetworkSelector from "@components/NetworkSelector";
import SelectFilter, {
    type SelectFilterOption,
} from "@components/common/SelectFilter";
import ConstrainedInput from "@components/common/ConstrainedInput";
import {
    DEFAULT_DEPLOY_GAS_COST,
    EMPTY_FORM_STATE,
    generateDeployId,
    isAmountInputAllowed,
    isDeployIdInputAllowed,
    isGasCostAllowed,
    MAX_GAS_COST,
    MIN_GAS_COST,
    toDefaultGasCost,
    toDeployIdError,
    toExpirationLabel,
    toFormState,
    toGasCostError,
    toRecipientError,
    toReservationMeta,
    toReservedAmount,
    type IReservationFormState,
} from "./helpers";

const EXPIRATION_TICK_MS: number = 1000;

const KIND_OPTIONS: SelectFilterOption[] = [
    { label: "Transfer", value: "transfer" },
    { label: "Deploy", value: "deploy" },
];

const ReservationsPage = (): ReactElement => {
    const {
        openWallets,
        reservationsByWallet,
        currentNetwork,
        isCurrentNetworkBusy,
        getAvailableBalance,
        getReservations,
        addTransactionReservation,
        updateTransactionReservation,
        removeTransactionReservation,
    } = useSdkContext();
    const runSecureAction = useSecureAction();

    const [selectedWalletId, setSelectedWalletId] = useState<string>("");
    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [form, setForm] = useState<IReservationFormState>(EMPTY_FORM_STATE);
    const [editedReservationId, setEditedReservationId] = useState<
        string | null
    >(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [rawSnapshot, setRawSnapshot] = useState<string | null>(null);
    const [available, setAvailable] = useState<bigint | null>(null);
    const [now, setNow] = useState<number>(() => Date.now());

    useEffect(() => {
        const timerId = setInterval(
            () => setNow(Date.now()),
            EXPIRATION_TICK_MS,
        );

        return () => clearInterval(timerId);
    }, []);

    const walletOptions = useMemo<SelectFilterOption[]>(
        () => [
            { label: "— select wallet —", value: "" },
            ...openWallets.map((wallet: Wallet) => ({
                label: `${wallet.getType()} ${wallet.getId()}`,
                value: wallet.getId(),
            })),
        ],
        [openWallets],
    );

    const selectedWallet = useMemo<Wallet | null>(
        () =>
            openWallets.find(
                (wallet: Wallet) => wallet.getId() === selectedWalletId,
            ) ?? null,
        [openWallets, selectedWalletId],
    );

    const accounts = useMemo<Account[]>(
        () => selectedWallet?.getAccounts() ?? [],
        [selectedWallet],
    );

    const accountOptions = useMemo<SelectFilterOption[]>(
        () => [
            { label: "— select account —", value: "" },
            ...accounts.map((account: Account) => ({
                label: `${account.getName()} (${formatAddress(
                    account.getAddress(),
                )})`,
                value: account.getId(),
            })),
        ],
        [accounts],
    );

    useEffect(() => {
        if (accounts.length !== 1) {
            return;
        }

        setSelectedAccountId(accounts[0].getId());
    }, [accounts]);

    const accountNamesById = useMemo<Record<string, string>>(
        () =>
            Object.fromEntries(
                accounts.map((account: Account) => [
                    account.getId(),
                    account.getName(),
                ]),
            ),
        [accounts],
    );

    const reservations: ITransactionReservation[] =
        reservationsByWallet[selectedWalletId] ?? [];

    const reservationsCount: number = reservations.length;

    useEffect(() => {
        if (!selectedWalletId || !selectedAccountId) {
            setAvailable(null);

            return;
        }

        let isDisposed: boolean = false;

        const loadAvailable = async (): Promise<void> => {
            try {
                const balance: bigint = await getAvailableBalance(
                    selectedWalletId,
                    selectedAccountId,
                );

                if (!isDisposed) {
                    setAvailable(balance);
                }
            } catch (balanceError) {
                if (!isDisposed) {
                    setAvailable(null);
                    setError(
                        getErrorMessage(
                            balanceError,
                            "Available balance is unavailable",
                        ),
                    );
                }
            }
        };

        void loadAvailable();

        return () => {
            isDisposed = true;
        };
    }, [
        getAvailableBalance,
        selectedWalletId,
        selectedAccountId,
        currentNetwork,
        reservationsCount,
    ]);

    const reservedAmount: bigint | null = useMemo(
        () => toReservedAmount(form),
        [form],
    );

    const deployIdError: string | null = toDeployIdError(form.deployId);

    const recipientError: string | null = toRecipientError(form);

    const gasCostError: string | null = toGasCostError(form);

    const editedReservation: ITransactionReservation | null =
        reservations.find(
            (reservation: ITransactionReservation) =>
                reservation.id === editedReservationId,
        ) ?? null;

    const reservedDelta: bigint | null =
        reservedAmount === null
            ? null
            : reservedAmount - BigInt(editedReservation?.pendingAmount ?? "0");

    const isOverAvailable: boolean =
        available !== null &&
        reservedDelta !== null &&
        reservedDelta > available;

    const balanceLimitError: string | null = isOverAvailable
        ? `${
              editedReservation ? "Reserve increase" : "Reserved amount"
          } exceeds the available balance of ${formatAssetAmount(available)}`
        : null;

    const resetForm = (): void => {
        setForm(EMPTY_FORM_STATE);
        setEditedReservationId(null);
        setError(null);
    };

    const updateForm = (patch: Partial<IReservationFormState>): void => {
        setNotice(null);
        setError(null);
        setForm((currentForm: IReservationFormState) => ({
            ...currentForm,
            ...patch,
        }));
    };

    const handleKindChange = (value: string): void => {
        const kind = value as TransactionReservationKind;

        updateForm({ kind, gasCost: toDefaultGasCost(kind) });
    };

    const isGasCostInputAllowed = (value: string): boolean =>
        isAmountInputAllowed(value) && isGasCostAllowed(form.kind, value);

    const startEditing = (reservation: ITransactionReservation): void => {
        setNotice(null);
        setError(null);
        setSelectedAccountId(reservation.accountId);
        setForm(toFormState(reservation));
        setEditedReservationId(reservation.id);
    };

    const submitReservation = async (
        meta: TTransactionReservationMeta,
    ): Promise<ITransactionReservation | undefined> => {
        const request: TTransactionReservationRequest = {
            walletId: selectedWalletId,
            accountId: selectedAccountId,
            ...meta,
        };

        if (!editedReservationId) {
            return runSecureAction({
                walletId: selectedWalletId,
                passwordTitle: "Enter wallet password to add the reservation",
                confirmMessage: `Reserve funds on ${accountNamesById[selectedAccountId]}?`,
                action: (password?: string) =>
                    addTransactionReservation(request, password),
            });
        }

        return runSecureAction({
            walletId: selectedWalletId,
            passwordTitle: "Enter wallet password to update the reservation",
            confirmMessage: `Update the reservation ${editedReservationId}?`,
            action: (password?: string) =>
                updateTransactionReservation(
                    editedReservationId,
                    request,
                    password,
                ),
        });
    };

    const handleSubmit = async (
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> => {
        event.preventDefault();

        setError(null);
        setNotice(null);

        if (reservedAmount === null) {
            return;
        }

        let meta: TTransactionReservationMeta;

        try {
            meta = toReservationMeta(form, reservedAmount);
        } catch (parseError) {
            setError(getErrorMessage(parseError, "Reservation form is invalid"));

            return;
        }

        try {
            const reservation = await submitReservation(meta);

            if (!reservation) {
                setNotice("Reservation action cancelled");

                return;
            }

            setNotice(
                editedReservationId
                    ? `Reservation ${reservation.id} updated`
                    : `Reservation ${reservation.id} created`,
            );

            resetForm();
        } catch (submitError) {
            console.error(submitError);

            setError(getErrorMessage(submitError, "Reservation action failed"));
        }
    };

    const handleRemove = async (
        reservation: ITransactionReservation,
    ): Promise<void> => {
        if (!window.confirm(`Remove the reservation ${reservation.id}?`)) {
            return;
        }

        setError(null);
        setNotice(null);

        try {
            await removeTransactionReservation(
                selectedWalletId,
                reservation.id,
            );

            setNotice(`Reservation ${reservation.id} removed`);

            if (editedReservationId === reservation.id) {
                resetForm();
            }
        } catch (removeError) {
            console.error(removeError);

            setError(getErrorMessage(removeError, "Reservation removal failed"));
        }
    };

    const handleWalletChange = (walletId: string): void => {
        setSelectedWalletId(walletId);
        setSelectedAccountId("");
        resetForm();
        setNotice(null);
        setRawSnapshot(null);
    };

    const fetchRawSnapshot = async (): Promise<void> => {
        setError(null);

        try {
            const items: ITransactionReservation[] =
                await getReservations(selectedWalletId);

            setRawSnapshot(JSON.stringify(items, null, 2));
        } catch (snapshotError) {
            setError(
                getErrorMessage(snapshotError, "Reservations read failed"),
            );
        }
    };

    const isAccountSelected = Boolean(selectedWalletId && selectedAccountId);
    const isFormReady =
        isAccountSelected &&
        reservedAmount !== null &&
        reservedAmount > 0n &&
        deployIdError === null &&
        recipientError === null &&
        gasCostError === null &&
        balanceLimitError === null;
    const isEditing = editedReservationId !== null;
    const assetName: string = DEFAULT_ASSET.getName();

    return (
        <main className="reservations-page">
            <NetworkSelector />

            <section className="reservations-page__panel">
                <div className="reservations-page__header">
                    <h2 className="reservations-page__title">Reservations</h2>
                    {currentNetwork && (
                        <span className="reservations-page__network">
                            {currentNetwork.name}
                        </span>
                    )}
                </div>

                <div className="reservations-page__scope">
                    <p>
                        This page is a sandbox for external reservations, the
                        ones created through{" "}
                        <code>Client.addTransactionReservation</code>.
                    </p>
                    <p>
                        Transfers and deploys create their own reservations
                        under the hood, and those cover funds that the network
                        is already about to spend. Editing or removing such a
                        reservation releases those funds early, so the available
                        balance stays wrong until the deploy is confirmed or
                        expires. The SDK does not mark where a reservation came
                        from, so the list below mixes both, and reservations
                        that appeared right after a transfer or a deploy are not
                        a case worth testing here.
                    </p>
                </div>

                {openWallets.length === 0 ? (
                    <p className="reservations-page__empty">
                        Unlock a wallet on the Wallets page to manage its
                        reservations.
                    </p>
                ) : (
                    <div className="reservations-page__controls">
                        <div className="reservations-page__field">
                            <SelectFilter
                                id="reservation-wallet"
                                label="Wallet:"
                                value={selectedWalletId}
                                options={walletOptions}
                                onChange={handleWalletChange}
                            />
                        </div>
                        <div className="reservations-page__field">
                            <SelectFilter
                                id="reservation-account"
                                label="Account:"
                                value={selectedAccountId}
                                options={accountOptions}
                                onChange={setSelectedAccountId}
                            />
                            {selectedAccountId && (
                                <span className="reservations-page__field-hint">
                                    available:{" "}
                                    {formatAssetAmount(available)}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {selectedWalletId && !selectedAccountId && (
                    <p className="reservations-page__notice">
                        Select an account: every reservation belongs to one, so
                        the SDK needs it for create, update and remove.
                    </p>
                )}

                {isCurrentNetworkBusy && (
                    <p className="reservations-page__notice">
                        The current network has an operation in progress,
                        reservation actions are rejected until it finishes.
                    </p>
                )}
            </section>

            {isAccountSelected && (
                <section className="reservations-page__panel">
                    <h3 className="reservations-page__subtitle">
                        {isEditing
                            ? `Edit reservation ${editedReservationId}`
                            : "Create reservation"}
                    </h3>

                    {isEditing && (
                        <p className="reservations-page__hint">
                            The SDK refuses to move a reservation to another
                            account or network, so switching the account above
                            makes the update fail on purpose.
                        </p>
                    )}

                    <form
                        className="reservations-page__form"
                        onSubmit={(event) => void handleSubmit(event)}
                    >
                        <div className="reservations-page__field">
                            <SelectFilter
                                id="reservation-kind"
                                label="Kind:"
                                value={form.kind}
                                options={KIND_OPTIONS}
                                onChange={handleKindChange}
                            />
                        </div>

                        <ConstrainedInput
                            id="reservation-deploy-id"
                            label="Deploy id:"
                            value={form.deployId}
                            onChange={(value: string) =>
                                updateForm({ deployId: value })
                            }
                            isAllowed={isDeployIdInputAllowed}
                            hint="hex of the deploy signature"
                            error={deployIdError}
                            wide
                            action={
                                <button
                                    type="button"
                                    className="reservations-page__action reservations-page__action--ghost"
                                    onClick={() =>
                                        updateForm({
                                            deployId: generateDeployId(),
                                        })
                                    }
                                >
                                    Generate
                                </button>
                            }
                        />

                        {form.kind === "transfer" && (
                            <>
                                <ConstrainedInput
                                    id="reservation-to"
                                    label="Recipient:"
                                    value={form.to}
                                    onChange={(value: string) =>
                                        updateForm({ to: value.trim() })
                                    }
                                    error={recipientError}
                                    wide
                                />
                                <ConstrainedInput
                                    id="reservation-amount"
                                    label={`Transfer amount, ${assetName}:`}
                                    value={form.amount}
                                    onChange={(value: string) =>
                                        updateForm({ amount: value })
                                    }
                                    isAllowed={isAmountInputAllowed}
                                    inputMode="decimal"
                                />
                            </>
                        )}

                        <ConstrainedInput
                            id="reservation-gas-cost"
                            label={`Gas cost, ${assetName}:`}
                            value={form.gasCost}
                            onChange={(value: string) =>
                                updateForm({ gasCost: value })
                            }
                            isAllowed={isGasCostInputAllowed}
                            inputMode="decimal"
                            hint={
                                form.kind === "transfer"
                                    ? `network charges ${MIN_GAS_COST} to ${MAX_GAS_COST}`
                                    : `default deploy budget is ${DEFAULT_DEPLOY_GAS_COST}`
                            }
                            error={gasCostError}
                        />

                        <ConstrainedInput
                            id="reservation-reserved"
                            label={`Reserved amount, ${assetName}:`}
                            value={formatAmount(reservedAmount)}
                            error={balanceLimitError}
                            readOnly
                        />

                        <p className="reservations-page__hint reservations-page__field--wide">
                            {form.kind === "transfer"
                                ? "The reserved amount is the transfer amount plus the gas cost: the SDK rejects a reservation that does not cover both."
                                : "A deploy moves no funds, so the whole reserved amount is its gas cost."}
                        </p>

                        {form.kind === "deploy" && (
                            <div className="reservations-page__field reservations-page__field--wide">
                                <label htmlFor="reservation-term">
                                    Contract code:
                                </label>
                                <textarea
                                    id="reservation-term"
                                    className="reservations-page__editor"
                                    value={form.term}
                                    onChange={(event) =>
                                        updateForm({ term: event.target.value })
                                    }
                                />
                            </div>
                        )}

                        <div className="reservations-page__actions">
                            <button
                                type="submit"
                                className="reservations-page__action"
                                disabled={!isFormReady}
                            >
                                {isEditing ? "Save" : "Create"}
                            </button>
                            {isEditing && (
                                <button
                                    type="button"
                                    className="reservations-page__action reservations-page__action--ghost"
                                    onClick={resetForm}
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>

                    {error && (
                        <div className="reservations-page__error">{error}</div>
                    )}

                    {notice && (
                        <div className="reservations-page__success">
                            {notice}
                        </div>
                    )}
                </section>
            )}

            {selectedWalletId && (
                <section className="reservations-page__panel">
                    <div className="reservations-page__header">
                        <h3 className="reservations-page__subtitle">
                            Active reservations: {reservations.length}
                        </h3>
                        <button
                            type="button"
                            className="reservations-page__action reservations-page__action--ghost"
                            onClick={() => void fetchRawSnapshot()}
                        >
                            Fetch raw snapshot
                        </button>
                    </div>

                    {reservations.length === 0 ? (
                        <p className="reservations-page__empty">
                            This wallet has no reservations on the current
                            network.
                        </p>
                    ) : (
                        <div className="reservations-table-wrap">
                            <table className="reservations-table">
                                <thead>
                                    <tr>
                                        <th>Kind</th>
                                        <th>Account</th>
                                        <th>Deploy id</th>
                                        <th>Reserved, {assetName}</th>
                                        <th>Details</th>
                                        <th>Expires in</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reservations.map(
                                        (
                                            reservation: ITransactionReservation,
                                        ) => (
                                            <tr key={reservation.id}>
                                                <td>{reservation.kind}</td>
                                                <td>
                                                    {accountNamesById[
                                                        reservation.accountId
                                                    ] ?? reservation.accountId}
                                                </td>
                                                <td className="reservations-table__mono">
                                                    {formatAddress(
                                                        reservation.details
                                                            .deployId,
                                                    )}
                                                </td>
                                                <td>
                                                    {formatAmount(
                                                        BigInt(
                                                            reservation.pendingAmount,
                                                        ),
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="reservations-table__details">
                                                        {reservation.details
                                                            .to && (
                                                            <div>
                                                                To:{" "}
                                                                {formatAddress(
                                                                    reservation
                                                                        .details
                                                                        .to,
                                                                )}
                                                            </div>
                                                        )}
                                                        {reservation.details
                                                            .amount && (
                                                            <div>
                                                                Amount:{" "}
                                                                {
                                                                    reservation
                                                                        .details
                                                                        .amount
                                                                }
                                                            </div>
                                                        )}
                                                        {reservation.details
                                                            .gasCost && (
                                                            <div>
                                                                Gas:{" "}
                                                                {
                                                                    reservation
                                                                        .details
                                                                        .gasCost
                                                                }
                                                            </div>
                                                        )}
                                                        {reservation.details
                                                            .contractCode && (
                                                            <div
                                                                title={
                                                                    reservation
                                                                        .details
                                                                        .contractCode
                                                                }
                                                            >
                                                                Contract code
                                                                attached
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    {toExpirationLabel(
                                                        reservation.expirationTime,
                                                        now,
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="reservations-table__actions">
                                                        <button
                                                            type="button"
                                                            className="reservations-page__action reservations-page__action--ghost"
                                                            onClick={() =>
                                                                startEditing(
                                                                    reservation,
                                                                )
                                                            }
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="reservations-page__action reservations-page__action--danger"
                                                            onClick={() =>
                                                                void handleRemove(
                                                                    reservation,
                                                                )
                                                            }
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ),
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {rawSnapshot !== null && (
                        <div className="reservations-page__result">
                            <h4>Client.getReservations() raw result</h4>
                            <pre>{rawSnapshot}</pre>
                        </div>
                    )}
                </section>
            )}
        </main>
    );
};

export default ReservationsPage;
