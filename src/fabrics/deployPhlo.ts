import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "@config/index";
import type NodeApiAdapter from "@domains/NodeApiAdapter";
import type { IErrorContext } from "@domains/CustomError";
import type { TDeployDetails } from "@services/TransactionService";
import { ensureValid, isUint256, validatePhloSettings } from "@utils/index";

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

export const resolveDeployPhlo = async (
    api: NodeApiAdapter,
    { phloLimit, phloPrice }: Pick<TDeployDetails, "phloLimit" | "phloPrice">,
    context: IErrorContext,
    preferredPhloLimit: number = DEFAULT_PHLO_LIMIT,
): Promise<IDeployPhlo> => {
    const range = { maxPhloPrice: api.getMaxPhloPrice() };
    ensureValid(validatePhloSettings({ phloLimit, phloPrice }, range), context);

    const { minPhloPrice, maxPhloLimit } = await api.getPhloParameters();
    const price = phloPrice === undefined ? minPhloPrice : BigInt(phloPrice);
    const limit = phloLimit ?? preferredPhloLimit;
    if (price < minPhloPrice) {
        throw new Error(`Phlo price is below the validator minimum of ${minPhloPrice}`);
    }
    if (phloLimit !== undefined && maxPhloLimit !== undefined && BigInt(phloLimit) > maxPhloLimit) {
        throw new Error(`Phlo limit exceeds the validator maximum of ${maxPhloLimit}`);
    }
    ensureValid(validatePhloSettings({ phloLimit: limit, phloPrice: price }, range), context);
    return createDeployPhlo({
        phloPrice: price,
        phloLimit: maxPhloLimit !== undefined && BigInt(limit) > maxPhloLimit
            ? Number(maxPhloLimit)
            : limit,
    });
};
