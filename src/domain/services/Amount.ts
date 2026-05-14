import { GasFeeVO } from "..";
import {FeeService} from "@/application/services/Fee";

export class Amount {
  /**
   * @returns amount + estimated gas fee
   */
  public static getEstimatedTotalTransferAmount(amount: bigint, gasFee: GasFeeVO = FeeService.getGasFeeVO()) {
      return amount + gasFee.gasFee;
  }
  /**
   * @returns amount + max possible gas fee
   */
  public static getMaxTotalTransferAmount(amount: bigint, gasFee: GasFeeVO = FeeService.getGasFeeVO()) {
      return amount + gasFee.gasFeeRange.max;
  }
}