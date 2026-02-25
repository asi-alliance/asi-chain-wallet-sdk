export const ASI_CHAIN_PREFIX = { coinId: "000000", version: "00" };

export const ASI_COIN_TYPE = 60;

export const ASI_DECIMALS = 8;

export const GasFee = {
    BASE_FEE: 0.0025,
    VARIATION_RANGE: 0.1,
    LABEL: "ASI",
    TRANSFER: "0.0025",
    DEPLOY: "0.0025",
};

export const POWER_BASE: number = 10;

export const ASI_BASE_UNIT = BigInt(POWER_BASE) ** BigInt(ASI_DECIMALS);

export const FAULT_TOLERANCE_THRESHOLD: number = 0.99;

export const INVALID_BLOCK_NUMBER = -1;