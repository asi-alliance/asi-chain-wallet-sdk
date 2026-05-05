import { GasFeeVO } from "@domains/Fee/GasFeeVO";
import { fromAtomicAmountToString } from "@utils";

/**
 * GasFee object for ui presentation
 */
export interface IGasFeeView {
  gasFee: string;
  gasFeeRange: {
    min: string;
    max: string;
  }
}

export function mapGasFeeToView(gasFeeVO: GasFeeVO): IGasFeeView {
  return {
    gasFee: fromAtomicAmountToString(gasFeeVO.gasFee),
    gasFeeRange: {
      min: fromAtomicAmountToString(gasFeeVO.gasFeeRange.min),
      max: fromAtomicAmountToString(gasFeeVO.gasFeeRange.max),
    }
  }
}