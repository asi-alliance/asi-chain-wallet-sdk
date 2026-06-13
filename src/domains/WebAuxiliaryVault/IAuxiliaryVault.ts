import { NetworkName } from "@domains/aggregates/Network";
import { Transaction } from "@domains/aggregates/Transaction";

export interface IAuxiliaryVault {
  transactions: Map<string, Transaction>;
  currentNetworkName: NetworkName | null; 

  save(): void;
  removeFromStorage(): void;
  lock(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
}
