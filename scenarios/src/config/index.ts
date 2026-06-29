import Asset from "../domains/Asset";
import { generateRandomId } from "../utils";

export const NATIVE_TOKEN_DECIMALS_AMOUNT: number = 8;

export const DEFAULT_ASSET: Asset = new Asset({
    id: generateRandomId(),
    name: "ASI",
});
