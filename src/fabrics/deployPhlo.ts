import { DEFAULT_PHLO_LIMIT } from "@config/index";
import type NodeApiAdapter from "@domains/NodeApiAdapter";
import type { IValidatorPhloParameters } from "@domains/ValidatorClient";
import type { IErrorContext } from "@domains/CustomError";
import type { TDeployDetails } from "@services/TransactionService";
import { ensureValid, isUint256, validatePhloSettings } from "@utils/index";

export interface IDeployPhlo {
    phloLimit: number;
    phloPrice: bigint;
    maxPhloCharge: bigint;
}

const capPhloLimit = (limit: number, maxPhloLimit?: bigint): number => {
    if (
        maxPhloLimit === undefined ||
        maxPhloLimit >= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
        return limit;
    }

    return Math.min(limit, Number(maxPhloLimit));
};

export const createDeployPhlo = (
    details: Pick<TDeployDetails, "phloLimit" | "phloPrice">,
    defaultPhloPrice: bigint,
): IDeployPhlo => {
    const phloLimit: number = details.phloLimit ?? DEFAULT_PHLO_LIMIT;
    const phloPrice: bigint = BigInt(details.phloPrice ?? defaultPhloPrice);
    const maxPhloCharge: bigint = BigInt(phloLimit) * phloPrice;

    if (!isUint256(maxPhloCharge)) {
        throw new Error(
            "createDeployPhlo: Maximum phlo charge exceeds uint256",
        );
    }

    return { phloLimit, phloPrice, maxPhloCharge };
};

/**
 * Resolve a deploy's price and limit against the submitting validator's
 * advertised parameters. An omitted price uses the validator minimum, an
 * omitted limit is capped at the validator maximum, and an explicit limit
 * above that maximum is rejected before anything is signed.
 */
export const resolveDeployPhlo = (
    api: NodeApiAdapter,
    details: Pick<TDeployDetails, "phloLimit" | "phloPrice">,
    { minPhloPrice, maxPhloLimit }: IValidatorPhloParameters,
    { context }: IErrorContext,
    preferredPhloLimit: number = DEFAULT_PHLO_LIMIT,
): IDeployPhlo => {
    ensureValid(
        validatePhloSettings(details, {
            maxPhloPrice: api.getMaxPhloPrice(),
            minPhloPrice,
        }),
        { context },
    );

    if (
        details.phloLimit !== undefined &&
        maxPhloLimit !== undefined &&
        BigInt(details.phloLimit) > maxPhloLimit
    ) {
        throw new Error(
            `Phlo limit exceeds the validator maximum of ${maxPhloLimit}`,
        );
    }

    return createDeployPhlo(
        {
            phloPrice: details.phloPrice,
            phloLimit:
                details.phloLimit ??
                capPhloLimit(preferredPhloLimit, maxPhloLimit),
        },
        minPhloPrice,
    );
};
