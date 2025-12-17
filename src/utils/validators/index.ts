import { Address } from "../../domains/Wallet";

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

export const isAddress = (address: string): address is Address => {
    return (
        address.startsWith(ADDRESS_START_STRING) &&
        address.length >= ADDRESS_MINIMUM_LENGTH &&
        address.length <= ADDRESS_MAXIMUM_LENGTH &&
        ADDRESS_ALPHABET_REGEX.test(address)
    );
};
