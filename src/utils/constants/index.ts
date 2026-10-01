export const PRIVATE_KEY_LENGTH = 32; // bytes

export const ASI_CHAIN_PREFIX = { coinId: "000000", version: "00" };

export const ASI_COIN_TYPE = 60;

export const ASI_DECIMALS = 8;

// export const GasFee = {
//     BASE_FEE: 0.0025,
//     VARIATION_RANGE: 0.1,
//     LABEL: "ASI",
//     TRANSFER: "0.0025",
//     DEPLOY: "0.0025",
// };

export const HEX_RADIX: number = 16;

export const HEX_BYTE_PADDING: number = 64;

export const POWER_BASE: number = 10;

export const ASI_BASE_UNIT = BigInt(POWER_BASE) ** BigInt(ASI_DECIMALS);

export const SCALA_FAULT_TOLERANCE_THRESHOLD: number = 0.99;
export const RUST_FAULT_TOLERANCE_THRESHOLD: number = 0.33;

export const INVALID_BLOCK_NUMBER = -1;

export const DIGITS_ONLY_REGEX: RegExp = /^\d+$/;
export const CANONICAL_INTEGER_REGEX: RegExp = /^(0|[1-9]\d*)$/;
export const INTEGER_REGEX: RegExp = /^-?\d+$/;
export const DECIMAL_REGEX: RegExp = /^-?\d+(?:\.\d+)?$/;
export const NON_NEGATIVE_INTEGER_REGEX = /^\d+$/;
export const NON_NEGATIVE_DECIMAL_REGEX = /^\d+(\.\d+)?$/;

export const DEFAULT_BIP_44_PATH_OPTIONS = {
    coinType: ASI_COIN_TYPE,
    account: 0,
    change: 0,
    index: 0,
};
