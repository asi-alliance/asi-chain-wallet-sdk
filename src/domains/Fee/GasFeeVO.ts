/**
 * Value Object for GasFee in domain (Atomic) units
 */
export class GasFeeVO {
  constructor(gasFee: bigint, gasFeeRangeMin: bigint, gasFeeRangeMax: bigint) {
    this.gasFee = gasFee;
    this.gasFeeRange = {
      min: gasFeeRangeMin,
      max: gasFeeRangeMax
    }
  }
  public readonly gasFee: bigint;
  public readonly gasFeeRange: {
    min: bigint;
    max: bigint;
  }
}

