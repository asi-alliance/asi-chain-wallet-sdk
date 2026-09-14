import {
    DEFAULT_ASSET,
    fromAtomicAmount,
    toAtomicAmount,
    type Asset,
} from "asi-wallet-sdk";

export const formatAddress = (address: string): string => {
    if (!address || address === "Unknown") return address;

    return `${address.substring(0, 10)}...${address.substring(
        address.length - 8,
    )}`;
};

export const formatAmount = (
    amount: bigint | null | undefined,
    asset: Asset = DEFAULT_ASSET,
): string => {
    if (typeof amount !== "bigint") {
        return "N/A";
    }

    return fromAtomicAmount(amount, asset.getDecimals());
};

export const formatAssetAmount = (
    amount: bigint | null | undefined,
    asset: Asset = DEFAULT_ASSET,
): string => {
    if (typeof amount !== "bigint") {
        return formatAmount(amount, asset);
    }

    return `${formatAmount(amount, asset)} ${asset.getName()}`;
};

export const parseAmount = (
    amount: string | number,
    asset: Asset = DEFAULT_ASSET,
): bigint => toAtomicAmount(amount, asset.getDecimals());

export const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString();
};
