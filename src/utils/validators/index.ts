import type { Address } from "@domains/Wallet";
import blakejs from "blakejs";
import {
    decodeBase16,
    decodeBase58,
    encodeBase16,
    encodeBase58,
} from "@utils/codec";
import { ASI_CHAIN_PREFIX } from "@utils/constants";

const { blake2bHex } = blakejs;

const INVALID_ACCOUNT_NAME_CHARS: RegExp = /[<>:"/\\|?*]/;

export const validateAccountName = (
    name: string,
    maxLength: number = 30
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

    let decodedHex = "";

    try {
        decodedHex = encodeBase16(decodeBase58(address));
    } catch {
        return getInvalidResult(AddressValidationErrorCode.INVALID_BASE58);
    }

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
        return getInvalidResult(AddressValidationErrorCode.INVALID_CHAIN_PREFIX);
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
