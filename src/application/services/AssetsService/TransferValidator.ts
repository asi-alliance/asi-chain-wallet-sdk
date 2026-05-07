import { GasFeeVO } from "../../../domain/aggregates/Fee";
import { Address } from "../../../domain/aggregates/Wallet";




export class TransferValidator {
  public static validate(fromAddress: Address, toAddress: Address, balance: bigint, amount: bigint, gasFee: GasFeeVO, errorMessagePrefix: string = "TransferValidator: ") {
    let addressValidationError;
    let amountValidationError;
    try {
      validateAddresses(fromAddress ,toAddress, errorMessagePrefix);
    } catch(error) {
      addressValidationError = error;
    }
    try {
      validateAmount(fromAddress, balance, amount, gasFee, errorMessagePrefix);
    } catch(error) {
      amountValidationError = error
    }
    if(addressValidationError || amountValidationError) {
      throw {message: "transfer validation error", addressValidationError, amountValidationError};
    }   
  }
}