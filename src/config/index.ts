import Asset from "@domains/Asset";
import { generateRandomId } from "@utils/functions";

export const NATIVE_TOKEN_DECIMALS_AMOUNT: number = 8;

export const DEFAULT_ASSET: Asset = new Asset({
    id: generateRandomId(),
    name: "ASI",
});

export const DEFAULT_PHLO_LIMIT: number = 500000;
export const DEFAULT_PHLO_PRICE: number = 1;

export const DEFAULT_NODE_STORAGE_DIR: string = "./storage";

export const GAS_FEE = {
    MIN: 170000n,
    MAX: 250000n,
};

export const DEPLOY_STATUS_POLLING_TIMEOUT: number = 3 * 60 * 1000;
export const RESERVATION_EXPIRATION_TIME: number = 5 * 60 * 1000;
