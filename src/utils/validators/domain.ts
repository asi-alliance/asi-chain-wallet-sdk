import type { Address } from "@domains/Wallet";
import type { IErrorContext } from "@domains/CustomError";
import type { TCreateTransactionReservationPayload } from "@fabrics/transactionReservation";
import { GasFee } from "@config/index";
import { NODE_API_PROFILES } from "@domains/NodeApiProfile";
import blakejs from "blakejs";
import { isNodeApiProfile } from "@utils/guards";
import { ASI_CHAIN_PREFIX } from "@utils/constants";
import {
    decodeBase16,
    decodeBase58,
    encodeBase16,
    encodeBase58,
} from "@utils/codec";

const { blake2bHex } = blakejs;

const INVALID_ACCOUNT_NAME_CHARS: RegExp = /[<>:"/\\|?*]/;

export const validateAccountName = (
    name: string,
    maxLength: number = 30,
): { isValid: boolean; error?: string } => {
    if (!name || name.trim().length === 0) {
        return { isValid: false, error: "Account name is required" };
    }

    if (name.length > maxLength) {
        return {
            isValid: false,
            error: `Account name must be ${maxLength} characters or less`,
        };
    }

    if (INVALID_ACCOUNT_NAME_CHARS.test(name)) {
        return {
            isValid: false,
            error: "Account name contains invalid characters",
        };
    }

    return { isValid: true };
};

const ADDRESS_START_STRING = "1111";
const ADDRESS_MINIMUM_LENGTH = 50;
const ADDRESS_MAXIMUM_LENGTH = 54;
const ADDRESS_ALPHABET_REGEX = /^[a-zA-Z0-9]+$/;
const ADDRESS_BASE58_ALPHABET_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;
const ADDRESS_PAYLOAD_HEX_LENGTH = 72;
const ADDRESS_CHECKSUM_HEX_LENGTH = 8;
const ADDRESS_TOTAL_HEX_LENGTH =
    ADDRESS_PAYLOAD_HEX_LENGTH + ADDRESS_CHECKSUM_HEX_LENGTH;
const ADDRESS_PREFIX_HEX = `${ASI_CHAIN_PREFIX.coinId}${ASI_CHAIN_PREFIX.version}`;

export enum AddressValidationErrorCode {
    INVALID_PREFIX = "INVALID_PREFIX",
    INVALID_LENGTH = "INVALID_LENGTH",
    INVALID_ALPHABET = "INVALID_ALPHABET",
    INVALID_BASE58 = "INVALID_BASE58",
    INVALID_HEX_LENGTH = "INVALID_HEX_LENGTH",
    INVALID_CHAIN_PREFIX = "INVALID_CHAIN_PREFIX",
    INVALID_CHECKSUM = "INVALID_CHECKSUM",
    NON_CANONICAL = "NON_CANONICAL",
}

export interface AddressValidationResult {
    isValid: boolean;
    errorCode?: AddressValidationErrorCode;
}

const getInvalidResult = (
    errorCode: AddressValidationErrorCode,
): AddressValidationResult => ({
    isValid: false,
    errorCode,
});

export const validateAddress = (address: string): AddressValidationResult => {
    if (!address.startsWith(ADDRESS_START_STRING)) {
        return getInvalidResult(AddressValidationErrorCode.INVALID_PREFIX);
    }

    if (
        address.length < ADDRESS_MINIMUM_LENGTH ||
        address.length > ADDRESS_MAXIMUM_LENGTH
    ) {
        return getInvalidResult(AddressValidationErrorCode.INVALID_LENGTH);
    }

    if (!ADDRESS_ALPHABET_REGEX.test(address)) {
        return getInvalidResult(AddressValidationErrorCode.INVALID_ALPHABET);
    }
    if (!ADDRESS_BASE58_ALPHABET_REGEX.test(address)) {
        return getInvalidResult(AddressValidationErrorCode.INVALID_BASE58);
    }
    const decodedHex = encodeBase16(decodeBase58(address));

    if (decodedHex.length !== ADDRESS_TOTAL_HEX_LENGTH) {
        return getInvalidResult(AddressValidationErrorCode.INVALID_HEX_LENGTH);
    }

    const canonicalAddress = encodeBase58(decodedHex);
    if (canonicalAddress !== address) {
        return getInvalidResult(AddressValidationErrorCode.NON_CANONICAL);
    }

    const payloadHex = decodedHex.slice(0, ADDRESS_PAYLOAD_HEX_LENGTH);
    const checksumHex = decodedHex.slice(ADDRESS_PAYLOAD_HEX_LENGTH);

    if (!payloadHex.startsWith(ADDRESS_PREFIX_HEX)) {
        return getInvalidResult(
            AddressValidationErrorCode.INVALID_CHAIN_PREFIX,
        );
    }

    const expectedChecksumHex = blake2bHex(
        decodeBase16(payloadHex),
        undefined,
        32,
    ).slice(0, ADDRESS_CHECKSUM_HEX_LENGTH);

    if (
        checksumHex.length !== ADDRESS_CHECKSUM_HEX_LENGTH ||
        checksumHex !== expectedChecksumHex
    ) {
        return getInvalidResult(AddressValidationErrorCode.INVALID_CHECKSUM);
    }

    return { isValid: true };
};

export const isAddress = (address: string): address is Address => {
    return validateAddress(address).isValid;
};

const ALLOWED_URL_PROTOCOLS: readonly string[] = ["http:", "https:"];

export const validateUrl = (
    url: string,
): { isValid: boolean; error?: string } => {
    const trimmed: string = url?.trim() ?? "";

    if (trimmed.length === 0) {
        return { isValid: false, error: "URL is required" };
    }

    let parsed: URL;

    try {
        parsed = new URL(trimmed);
    } catch {
        return { isValid: false, error: "URL is not valid" };
    }

    if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
        return {
            isValid: false,
            error: "URL must use http or https protocol",
        };
    }

    if (parsed.hostname.length === 0) {
        return { isValid: false, error: "URL must contain a host" };
    }

    return { isValid: true };
};

export const isValidUrl = (url: string): boolean => validateUrl(url).isValid;

export const validateNodeApiProfile = (
    profile: unknown,
): { isValid: boolean; error?: string } => {
    if (profile === undefined || profile === null) {
        return { isValid: false, error: "Node API profile is required" };
    }

    if (!isNodeApiProfile(profile)) {
        return {
            isValid: false,
            error: `Node API profile must be one of: ${NODE_API_PROFILES.join(", ")}`,
        };
    }

    return { isValid: true };
};

export const ensureValid = (
    { isValid, error }: { isValid: boolean; error?: string },
    { context }: IErrorContext,
): void => {
    if (!isValid) {
        throw new Error(`${context}: ${error}`);
    }
};

export const validatePositiveAmount = (
    amount: bigint,
): { isValid: boolean; error?: string } => {
    if (amount <= 0n) {
        return { isValid: false, error: "Amount must be greater than zero" };
    }

    return { isValid: true };
};

export const validateReservationPayload = (
    payload: TCreateTransactionReservationPayload,
): { isValid: boolean; error?: string } => {
    if (!payload.deployId.trim()) {
        return { isValid: false, error: "Deploy id is required" };
    }

    if (!validatePositiveAmount(payload.pendingAmount).isValid) {
        return {
            isValid: false,
            error: "Reserved amount must be greater than zero",
        };
    }

    if (payload.gasCost !== undefined && payload.gasCost < 0n) {
        return { isValid: false, error: "Gas cost must not be negative" };
    }

    if (
        payload.gasCost !== undefined &&
        payload.gasCost > payload.pendingAmount
    ) {
        return {
            isValid: false,
            error: "Gas cost must not exceed the reserved amount",
        };
    }

    if (payload.kind === "deploy") {
        return { isValid: true };
    }

    const recipient: AddressValidationResult = validateAddress(
        payload.details.to,
    );

    if (!recipient.isValid) {
        return {
            isValid: false,
            error: `Recipient address is invalid: ${recipient.errorCode}`,
        };
    }

    if (!validatePositiveAmount(payload.details.amount).isValid) {
        return {
            isValid: false,
            error: "Transfer amount must be greater than zero",
        };
    }

    const transferGasCost: bigint = payload.gasCost ?? GasFee.MAX;

    if (payload.details.amount + transferGasCost > payload.pendingAmount) {
        return {
            isValid: false,
            error: "Reserved amount must cover the transfer amount and gas cost",
        };
    }

    return { isValid: true };
};
