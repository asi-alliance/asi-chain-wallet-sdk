import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "@config/index";
import type { TDeployDetails } from "@services/TransactionService";
import { isUint256 } from "@utils/index";

export interface IDeployPhlo {
    phloLimit: number;
    phloPrice: bigint;
    maxPhloCharge: bigint;
}

export const createDeployPhlo = (
    details: Pick<TDeployDetails, "phloLimit" | "phloPrice">,
): IDeployPhlo => {
    const phloLimit: number = details.phloLimit ?? DEFAULT_PHLO_LIMIT;
    const phloPrice: bigint = BigInt(details.phloPrice ?? DEFAULT_PHLO_PRICE);
    const maxPhloCharge: bigint = BigInt(phloLimit) * phloPrice;

    if (!isUint256(maxPhloCharge)) {
        throw new Error(
            "createDeployPhlo: Maximum phlo charge exceeds uint256",
        );
    }

    return { phloLimit, phloPrice, maxPhloCharge };
};
