import { utils as secp256k1Utils } from "@noble/secp256k1";
import { PRIVATE_KEY_LENGTH } from "@utils/constants";

export const isIntegerInRange = (
    value: number,
    min: number,
    max: number,
): boolean => {
    return Number.isInteger(value) && value >= min && value <= max;
};

export const validatePrivateKey = (
    privateKey: Uint8Array,
): { isValid: boolean; error?: string } => {
    if (privateKey.length !== PRIVATE_KEY_LENGTH) {
        return {
            isValid: false,
            error: `Private key must be ${PRIVATE_KEY_LENGTH} bytes`,
        };
    }

    if (!secp256k1Utils.isValidPrivateKey(privateKey)) {
        return {
            isValid: false,
            error: "Private key is out of the secp256k1 curve range",
        };
    }

    return { isValid: true };
};

export const isPrivateKeyValid = (privateKey: Uint8Array): boolean =>
    validatePrivateKey(privateKey).isValid;
