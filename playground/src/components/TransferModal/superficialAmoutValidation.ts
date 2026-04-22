import {type Atomic} from "asi-wallet-sdk";

export function superficialAmoutValidation(amount: Atomic) {
  return amount > 0;
}