import type { Address } from "@domains/Wallet";
import blakejs from "blakejs";
import { decodeBase16, decodeBase58, encodeBase16 } from "@utils/codec";
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

export const isAddress = (address: string): address is Address => {
    if (
        !address.startsWith(ADDRESS_START_STRING) ||
        address.length < ADDRESS_MINIMUM_LENGTH ||
        address.length > ADDRESS_MAXIMUM_LENGTH ||
        !ADDRESS_ALPHABET_REGEX.test(address)
    ) {
        return false;
    }

    let decodedHex = "";

    try {
        decodedHex = encodeBase16(decodeBase58(address));
    } catch {
        return false;
    }

    if (decodedHex.length !== ADDRESS_TOTAL_HEX_LENGTH) {
        return false;
    }

    const payloadHex = decodedHex.slice(0, ADDRESS_PAYLOAD_HEX_LENGTH);
    const checksumHex = decodedHex.slice(ADDRESS_PAYLOAD_HEX_LENGTH);

    if (!payloadHex.startsWith(ADDRESS_PREFIX_HEX)) {
        return false;
    }

    const expectedChecksumHex = blake2bHex(
        decodeBase16(payloadHex),
        undefined,
        32,
    ).slice(0, ADDRESS_CHECKSUM_HEX_LENGTH);

    return (
        checksumHex.length === ADDRESS_CHECKSUM_HEX_LENGTH &&
        checksumHex === expectedChecksumHex
    );
};
