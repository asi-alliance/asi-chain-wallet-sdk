import Asset from "../domains/Asset";
import { generateRandomId } from "../utils";

const DEFAULT_DECIMALS_AMOUNT: number = 8;

export const defaultAsset: Asset = new Asset(
    generateRandomId(),
    "ASI",
    DEFAULT_DECIMALS_AMOUNT,
);
