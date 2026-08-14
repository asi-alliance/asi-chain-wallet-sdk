export const NATIVE_TOKEN_DECIMALS_AMOUNT: number = 8;

export const DEFAULT_PHLO_LIMIT: number = 500000;
export const DEFAULT_PHLO_PRICE: number = 1;

export const DEFAULT_NODE_STORAGE_DIR: string = "./storage";

export const ASI_WALLET_KEYFILE: string = "asi-wallet-keyfile";

export const ASI_WALLET_KEYFILE_VERSION: number = 1;

export const ExportFormat = {
    JSON: "json",
    CSV: "csv",
} as const;

export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

export const TRANSACTIONS_CSV_HEADERS: string[] = [
    "Date",
    "Time",
    "Type",
    "Status",
    "From",
    "To",
    "Amount",
    "Gas Cost",
    "Deploy ID",
    "Block Hash",
    "Network ID",
    "Note",
];

export const GasFee = {
    MIN: 170000n,
    MAX: 250000n,
};

export const DEPLOY_STATUS_POLLING_TIMEOUT: number = 3 * 60 * 1000;
export const RESERVATION_EXPIRATION_TIME: number = 5 * 60 * 1000;
export const DEFAULT_REQUEST_TIMEOUT: number = 30 * 1000;

export const RequirePassword = {
    ONCE_PER_SESSION: "once-per-session",
    EVERY_SIGNATURE: "every-signature",
} as const;

export type RequirePassword =
    (typeof RequirePassword)[keyof typeof RequirePassword];

export const DEFAULT_AUTO_LOCK_MS: number = 15 * 60 * 1000;

export const DEFAULT_DRAIN_TIMEOUT_MS: number = 10 * 1000;
