import { NetworkName } from "@domain/";
import { Transaction } from "@/domain/aggregates/Transaction";

export interface IAuxiliaryVault {
  transactions: Map<string, Transaction>;
  currentNetworkName: NetworkName | null; 

  save(): void;
  removeFromStorage(): void;
  lock(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
}
