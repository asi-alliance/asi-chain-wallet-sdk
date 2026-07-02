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
