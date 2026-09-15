import {
    DEFAULT_PHLO_LIMIT,
    DEFAULT_PHLO_PRICE,
    GasFee,
    isAddress,
    validateAddress,
    type AddressValidationResult,
    type ITransactionReservation,
    type TTransactionReservationMeta,
    type TransactionReservationKind,
} from "asi-wallet-sdk";
import { formatAmount, parseAmount } from "../../sdk-react-kit";

export const MIN_GAS_COST: string = formatAmount(GasFee.MIN);
export const MAX_GAS_COST: string = formatAmount(GasFee.MAX);

export const DEFAULT_DEPLOY_GAS_COST: string = formatAmount(
    BigInt(DEFAULT_PHLO_LIMIT) * BigInt(DEFAULT_PHLO_PRICE),
);

export const toDefaultGasCost = (kind: TransactionReservationKind): string =>
    kind === "deploy" ? DEFAULT_DEPLOY_GAS_COST : MAX_GAS_COST;

const toAmountOrNull = (value: string): bigint | null => {
    try {
        return parseAmount(value);
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

export const EMPTY_FORM_STATE: IReservationFormState = {
    kind: "transfer",
    deployId: "",
    gasCost: toDefaultGasCost("transfer"),
    to: "",
    amount: "",
    term: "",
};

export const toReservedAmount = (
    form: IReservationFormState,
): bigint | null => {
    const gasCost: bigint | null = toAmountOrNull(form.gasCost);

    if (gasCost === null) {
        return null;
    }

    if (form.kind === "deploy") {
        return gasCost;
    }

    const amount: bigint | null = toAmountOrNull(form.amount);

    if (amount === null) {
        return null;
    }

    return amount + gasCost;
};

export const isGasCostAllowed = (
    kind: TransactionReservationKind,
    value: string,
): boolean => {
    if (kind === "deploy") {
        return true;
    }

    const gasCost: bigint | null = toAmountOrNull(value);

    if (gasCost === null) {
        return true;
    }

    return gasCost <= GasFee.MAX;
};

export const toGasCostError = (
    form: IReservationFormState,
): string | null => {
    const gasCost: bigint | null = toAmountOrNull(form.gasCost);

    if (gasCost === null) {
        return "Gas cost is required";
    }

    if (form.kind === "deploy") {
        return gasCost > 0n
            ? null
            : "Gas cost must be greater than zero";
    }

    if (gasCost < GasFee.MIN) {
        return `Gas cost must be at least ${MIN_GAS_COST}`;
    }

    return null;
};

export const toRecipientError = (
    form: IReservationFormState,
): string | null => {
    if (form.kind === "deploy") {
        return null;
    }

    const to: string = form.to.trim();

    if (!to) {
        return "Recipient is required";
    }

    const { isValid, errorCode }: AddressValidationResult = validateAddress(to);

    if (isValid) {
        return null;
    }

    return `Recipient address is invalid: ${errorCode}`;
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
): TTransactionReservationMeta => {
    const deployId: string = form.deployId.trim();
    const gasCost: bigint = parseAmount(form.gasCost);

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
        amount: parseAmount(form.amount),
    };
};

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
