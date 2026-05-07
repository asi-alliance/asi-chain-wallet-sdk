import { GasFeeVO } from "../../../domain/aggregates/Fee/GasFeeVO";
import { fromAtomicAmount } from "@utils";

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
    gasFee: fromAtomicAmount(gasFeeVO.gasFee),
    gasFeeRange: {
      min: fromAtomicAmount(gasFeeVO.gasFeeRange.min),
      max: fromAtomicAmount(gasFeeVO.gasFeeRange.max),
    }
  }
}