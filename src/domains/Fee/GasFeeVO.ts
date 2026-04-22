import { Atomic } from "@domains/types";

/**
 * Value Object for GasFee in Atomic units
 */
export class GasFeeVO {
  constructor(gasFee: Atomic, gasFeeRangeMin: Atomic, gasFeeRageMax: Atomic) {
    this.gasFee = gasFee;
    this.gasFeeRange = {
      min: gasFeeRangeMin,
      max: gasFeeRageMax
    }
  }
  public readonly gasFee: Atomic;
  public readonly gasFeeRange: {
    min: Atomic;
    max: Atomic;
  }
  public clone(): GasFeeVO {
    return new GasFeeVO(this.gasFee, this.gasFeeRange.min, this.gasFeeRange.max);
  }
}

