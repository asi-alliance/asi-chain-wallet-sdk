import {
    DEFAULT_PHLO_LIMIT,
    DEFAULT_PHLO_PRICE,
    GasFee,
    isAddress,
    type Asset,
    type ITransactionReservation,
    type TTransactionReservationMeta,
    type TransactionReservationKind,
} from "asi-wallet-sdk";
import {
    formatAmount,
    parseAmount,
    toAddressError,
} from "../../sdk-react-kit";

const DEFAULT_DEPLOY_GAS_BUDGET: bigint =
    BigInt(DEFAULT_PHLO_LIMIT) * BigInt(DEFAULT_PHLO_PRICE);

export const toMinGasCost = (asset: Asset): string =>
    formatAmount(GasFee.MIN, asset);

export const toMaxGasCost = (asset: Asset): string =>
    formatAmount(GasFee.MAX, asset);

export const toDefaultDeployGasCost = (asset: Asset): string =>
    formatAmount(DEFAULT_DEPLOY_GAS_BUDGET, asset);

export const toDefaultGasCost = (
    kind: TransactionReservationKind,
    asset: Asset,
): string =>
    kind === "deploy" ? toDefaultDeployGasCost(asset) : toMaxGasCost(asset);

const toAmountOrNull = (value: string, asset: Asset): bigint | null => {
    try {
        return parseAmount(value, asset);
    } catch {
        return null;
    }
};

export interface IReservationFormState {
    kind: TransactionReservationKind;
    deployId: string;
    gasCost: string;
    to: string;
    amount: string;
    term: string;
}

export const createEmptyFormState = (asset: Asset): IReservationFormState => ({
    kind: "transfer",
    deployId: "",
    gasCost: toDefaultGasCost("transfer", asset),
    to: "",
    amount: "",
    term: "",
});

export const toReservedAmount = (
    form: IReservationFormState,
    asset: Asset,
): bigint | null => {
    const gasCost: bigint | null = toAmountOrNull(form.gasCost, asset);

    if (gasCost === null) {
        return null;
    }

    if (form.kind === "deploy") {
        return gasCost;
    }

    const amount: bigint | null = toAmountOrNull(form.amount, asset);

    if (amount === null) {
        return null;
    }

    return amount + gasCost;
};

export const isGasCostAllowed = (
    kind: TransactionReservationKind,
    value: string,
    asset: Asset,
): boolean => {
    if (kind === "deploy") {
        return true;
    }

    const gasCost: bigint | null = toAmountOrNull(value, asset);

    if (gasCost === null) {
        return true;
    }

    return gasCost <= GasFee.MAX;
};

export const toGasCostError = (
    form: IReservationFormState,
    asset: Asset,
): string | null => {
    const gasCost: bigint | null = toAmountOrNull(form.gasCost, asset);

    if (gasCost === null) {
        return "Gas cost is required";
    }

    if (form.kind === "deploy") {
        return gasCost > 0n
            ? null
            : "Gas cost must be greater than zero";
    }

    if (gasCost < GasFee.MIN) {
        return `Gas cost must be at least ${toMinGasCost(asset)}`;
    }

    return null;
};

export const toRecipientError = (
    form: IReservationFormState,
): string | null => {
    if (form.kind === "deploy") {
        return null;
    }

    return toAddressError(form.to);
};

export const toDuplicateDeployIdError = (
    deployId: string,
    reservations: ITransactionReservation[],
    editedReservationId: string | null,
): string | null => {
    const trimmedDeployId: string = deployId.trim();

    const hasDuplicate: boolean = reservations.some(
        (reservation: ITransactionReservation) =>
            reservation.id !== editedReservationId &&
            reservation.details.deployId === trimmedDeployId,
    );

    return hasDuplicate
        ? "A reservation for this deploy id already exists on the current network"
        : null;
};

export const toFormState = (
    reservation: ITransactionReservation,
): IReservationFormState => ({
    kind: reservation.kind,
    deployId: reservation.details.deployId,
    gasCost: reservation.details.gasCost ?? "",
    to: reservation.details.to ?? "",
    amount: reservation.details.amount ?? "",
    term: reservation.details.contractCode ?? "",
});

export const toReservationMeta = (
    form: IReservationFormState,
    pendingAmount: bigint,
    asset: Asset,
): TTransactionReservationMeta => {
    const deployId: string = form.deployId.trim();
    const gasCost: bigint = parseAmount(form.gasCost, asset);

    if (form.kind === "deploy") {
        return {
            kind: "deploy",
            deployId,
            pendingAmount,
            gasCost,
            term: form.term.trim() || undefined,
        };
    }

    const to: string = form.to.trim();

    if (!isAddress(to)) {
        throw new Error("Recipient address is not a valid ASI address");
    }

    return {
        kind: "transfer",
        deployId,
        pendingAmount,
        gasCost,
        to,
        amount: parseAmount(form.amount, asset),
    };
};

export const toReservedTotal = (
    reservations: ITransactionReservation[],
    accountId: string,
): bigint =>
    reservations.reduce(
        (total: bigint, reservation: ITransactionReservation) =>
            reservation.accountId === accountId
                ? total + BigInt(reservation.pendingAmount)
                : total,
        0n,
    );

export const toExpirationLabel = (
    expirationTime: number,
    now: number,
): string => {
    const secondsLeft: number = Math.round((expirationTime - now) / 1000);

    if (secondsLeft <= 0) {
        return "expired";
    }

    const minutes: number = Math.floor(secondsLeft / 60);
    const seconds: number = secondsLeft % 60;

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
