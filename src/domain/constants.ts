/**
 * constants of domain layer. Important: Do not store constants associated with other layers here.
 */

export const PRIVATE_KEY_LENGTH = 32; // bytes

export const ASI_CHAIN_PREFIX = { coinId: "000000", version: "00" };
export const COIN_NAME = "ASI";

export const ASI_COIN_TYPE = 60;

export const ASI_DECIMALS = 8;

export const GAS_FEE = {
    MIN: 170000n,
    MAX: 250000n
};

export const HEX_RADIX: number = 16;

export const HEX_BYTE_PADDING: number = 64;

export const POWER_BASE: number = 10;

export const ASI_BASE_UNIT = BigInt(POWER_BASE) ** BigInt(ASI_DECIMALS);

export const FAULT_TOLERANCE_THRESHOLD: number = 0.99;

export const INVALID_BLOCK_NUMBER = -1;

export const DEFAULT_BIP_44_PATH_OPTIONS = {
    coinType: ASI_COIN_TYPE,
    account: 0,
    change: 0,
    index: 0,
}

export const MAX_WALLETS_PER_ACCOUNT: number = 20;