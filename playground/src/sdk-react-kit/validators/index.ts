import {
    DEFAULT_ASSET,
    DEFAULT_NODE_API_PROFILE,
    genRandomHex,
    isIntegerInRange,
    isNodeApiProfile,
    NodeApiProfile,
    NON_NEGATIVE_INTEGER_REGEX,
    validateAccountName,
    validateAddress,
    type AddressValidationResult,
} from "asi-wallet-sdk";

export const toNodeApiProfile = (value: unknown): NodeApiProfile => {
    if (isNodeApiProfile(value)) {
        return value;
    }

    return DEFAULT_NODE_API_PROFILE;
};

const SIGNATURE_HEX_LENGTH: number = 142;

export const SIGNATURE_HEX_MIN_LENGTH: number = 128;
export const SIGNATURE_HEX_MAX_LENGTH: number = 144;

const AMOUNT_INPUT_REGEX: RegExp = /^\d*(?:\.\d*)?$/;

const HEX_REGEX: RegExp = /^[0-9a-fA-F]+$/;

export const isAmountInputAllowed = (value: string): boolean => {
    if (!AMOUNT_INPUT_REGEX.test(value)) {
        return false;
    }

    const fraction: string = value.split(".")[1] ?? "";

    return fraction.length <= DEFAULT_ASSET.getDecimals();
};

export const isIntegerInputAllowed = (
    value: string,
    max: number = Number.MAX_SAFE_INTEGER,
): boolean => {
    if (value === "") {
        return true;
    }

    if (!NON_NEGATIVE_INTEGER_REGEX.test(value)) {
        return false;
    }

    return Number(value) <= max;
};

export interface IIntegerRangeOptions {
    label: string;
    min: number;
    max: number;
}

export const toIntegerRangeError = (
    value: string,
    { label, min, max }: IIntegerRangeOptions,
): string | null => {
    if (!value.trim()) {
        return `${label} is required`;
    }

    if (!isIntegerInRange(Number(value), min, max)) {
        return `${label} must be an integer between ${min} and ${max}`;
    }

    return null;
};

export const isDeployIdInputAllowed = (value: string): boolean =>
    value === "" || HEX_REGEX.test(value);

export const generateDeployId = (): string =>
    genRandomHex(SIGNATURE_HEX_LENGTH);

export const toDeployIdError = (value: string): string | null => {
    const deployId: string = value.trim();

    if (!deployId) {
        return "Deploy id is required";
    }

    if (!HEX_REGEX.test(deployId)) {
        return "Deploy id must be a hex string";
    }

    if (deployId.length % 2 !== 0) {
        return "Deploy id must hold whole bytes, so its length must be even";
    }

    return null;
};

export const toAddressError = (value: string): string | null => {
    const address: string = value.trim();

    if (!address) {
        return "Address is required";
    }

    const { isValid, errorCode }: AddressValidationResult =
        validateAddress(address);

    if (isValid) {
        return null;
    }

    return `Address is invalid: ${errorCode}`;
};

export const toAccountNameError = (value: string): string | null => {
    const { isValid, error } = validateAccountName(value);

    if (isValid) {
        return null;
    }

    return error ?? null;
};

export const toDeployIdLengthError = (value: string): string | null => {
    const length: number = value.trim().length;

    if (
        length < SIGNATURE_HEX_MIN_LENGTH ||
        length > SIGNATURE_HEX_MAX_LENGTH
    ) {
        return `Deploy id is a signature, so it holds ${SIGNATURE_HEX_MIN_LENGTH} to ${SIGNATURE_HEX_MAX_LENGTH} hex characters`;
    }

    return null;
};
