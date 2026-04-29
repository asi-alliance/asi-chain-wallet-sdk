import { Transaction } from "@domains/Transaction";


export interface IAuxiliaryVault {
  transactions: Map<string, Transaction>;

  save(): void;
  removeFromStorage(): void;
  lock(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
}
