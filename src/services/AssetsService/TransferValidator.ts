import { GasFeeVO } from "@domains/Fee";
import { Address } from "@domains/Wallet";
import FundsReservationService from "@services/FundsReservation";
import { COIN_NAME, fromAtomicAmount } from "@utils";
import { validateAddress } from "@utils/validators";
import { Amount } from "./Amount";


function validateAddresses(fromAddress: Address, toAddress: Address, errorMessagePrefix: string): void {
  const fromValidation = validateAddress(fromAddress);
  if (!fromValidation.isValid) {
      throw new Error(
          `${errorMessagePrefix}Invalid 'fromAddress': ${fromValidation.errorCode ?? "UNKNOWN"}`,
      );
  }

  const toValidation = validateAddress(toAddress);
  if (!toValidation.isValid) {
      throw new Error(
          `${errorMessagePrefix}Invalid 'toAddress': ${toValidation.errorCode ?? "UNKNOWN"}`,
      );
  }

  if (fromAddress === toAddress) {
      throw new Error(
          `${errorMessagePrefix}Sender and recipient addresses cannot be the same`,
      );
  }
}

function validateAmount(fromAddress: Address, balance: bigint, amount: bigint, gasFee: GasFeeVO, errorMessagePrefix: string): void {
  if (amount <= 0n) {
      throw new Error(
          `${errorMessagePrefix}Transfer amount must be greater than zero`,
      );
  }
  const requiredBalanceForTransfer = Amount.getMaxTotalTransferAmount(amount, gasFee);
  const requiredBalanceForTransferString = ` Required balance for transfer: ${fromAtomicAmount(requiredBalanceForTransfer)} ${COIN_NAME}`;
  if (amount > balance) {
    throw new Error(
      `${errorMessagePrefix}Transfer amount must not exceed the balance.${requiredBalanceForTransferString}`
    );
  }

  const totalReserved = FundsReservationService.getInstance().getTotalReserved(fromAddress);
  const availableBalance = balance - totalReserved;
  if (amount > availableBalance) {
      throw new Error(
          `${errorMessagePrefix}Transfer amount must not exceed the available(taking into account reservations) balance.${requiredBalanceForTransferString}`,
      );
  }

  if (Amount.getEstimatedTotalTransferAmount(amount, gasFee) > availableBalance) {
    throw new Error(
      `${errorMessagePrefix}The transfer amount, including the estimated gas fee, must not exceed the available balance.${requiredBalanceForTransferString}`
    );
  }
  if (requiredBalanceForTransfer > availableBalance) {
        throw new Error(
      `${errorMessagePrefix}The transfer amount, including the maximum gas fee, must not exceed the available balance.${requiredBalanceForTransferString}`
    );
  }
}

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