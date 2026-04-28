import { fromAtomicAmount } from "asi-wallet-sdk";

export const formatAddress = (address: string): string => {
    if (!address || address === "Unknown") return address;

    return `${address.substring(0, 10)}...${address.substring(
        address.length - 8,
    )}`;
};
export const formatAmount = (amount: bigint | null | undefined) => {
  if(typeof amount !== "bigint") {
    return "N/A"
  }
  return fromAtomicAmount(amount);
}
export const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString();
};