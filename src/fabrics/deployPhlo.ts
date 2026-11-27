import { DEFAULT_PHLO_LIMIT } from "@config/index";
import type { TDeployDetails } from "@services/TransactionService";
import { isUint256 } from "@utils/index";

export interface IDeployPhlo {
    phloLimit: number;
    phloPrice: bigint;
    maxPhloCharge: bigint;
}

const getDefaultPhloLimit = (maxPhloLimit: bigint | null): number =>
    maxPhloLimit !== null && maxPhloLimit < BigInt(DEFAULT_PHLO_LIMIT)
        ? Number(maxPhloLimit)
        : DEFAULT_PHLO_LIMIT;

export const createDeployPhlo = (
    details: Pick<TDeployDetails, "phloLimit" | "phloPrice">,
    defaultPhloPrice: bigint,
    maxPhloLimit: bigint | null = null,
): IDeployPhlo => {
    const phloLimit: number =
        details.phloLimit ?? getDefaultPhloLimit(maxPhloLimit);
    const phloPrice: bigint = BigInt(details.phloPrice ?? defaultPhloPrice);
    const maxPhloCharge: bigint = BigInt(phloLimit) * phloPrice;

    if (!isUint256(maxPhloCharge)) {
        throw new Error(
            "createDeployPhlo: Maximum phlo charge exceeds uint256",
        );
    }

    return { phloLimit, phloPrice, maxPhloCharge };
};
