import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "@config/index";
import { IErrorContext } from "@domains/CustomError";
import { IDeployPhlo } from "@domains/Deploy";
import type { TDeployDetails } from "@services/TransactionService";
import { ensureValid, isUint256, validatePhloSettings } from "@utils/index";

export const createDeployPhlo = (
    details: Pick<TDeployDetails, "phloLimit" | "phloPrice">,
    { maxPhloPrice }: { maxPhloPrice: bigint },
    { context }: IErrorContext,
): IDeployPhlo => {
    ensureValid(validatePhloSettings(details, { maxPhloPrice }), { context });

    const phloLimit: number = details.phloLimit ?? DEFAULT_PHLO_LIMIT;
    const phloPrice: bigint = BigInt(details.phloPrice ?? DEFAULT_PHLO_PRICE);
    const maxPhloCharge: bigint = BigInt(phloLimit) * phloPrice;

    if (!isUint256(maxPhloCharge)) {
        throw new Error(`${context}: Maximum phlo charge exceeds uint256`);
    }

    return { phloLimit, phloPrice, maxPhloCharge };
};
