import { Atomic } from "@domains/types";

/**
 * Value Object for GasFee in domain (Atomic) units
 */
export class GasFeeVO {
  constructor(gasFee: Atomic, gasFeeRangeMin: Atomic, gasFeeRangeMax: Atomic) {
    this.gasFee = gasFee;
    this.gasFeeRange = {
      min: gasFeeRangeMin,
      max: gasFeeRangeMax
    }
  }
  public readonly gasFee: Atomic;
  public readonly gasFeeRange: {
    min: Atomic;
    max: Atomic;
  }
}

