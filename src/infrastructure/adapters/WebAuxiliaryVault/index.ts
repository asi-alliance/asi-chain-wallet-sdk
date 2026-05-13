import CryptoService, { type EncryptedData } from "../Crypto";
import { Transaction } from "../../../domain/aggregates/Transaction";
import { IAuxiliaryVault } from "../../../application/ports/outbound/IAuxiliaryVault";
import { IUiEventDispatcher } from "../../../application/ports/outbound/IUiEventDispatcher";
import { NetworkName } from "@domain/";

const DEFAULT_AUXILIARY_VAULT_STORAGE_KEY = "ASI_AUXILLIARY_VAULT";

export type RawAuxiliaryVaultData = string;

type StoredTransaction = Omit<Transaction, "timestamp"> & {
  timestamp: string;
};

type StoredTransactions = Array<[string, StoredTransaction]>;

/**
 * decrypted data in JSON format
 */
type StoredData = {
  transactions: StoredTransactions;
  currentNetworkName: NetworkName | null;
}

/**
 * Auxiliary storage for storing data that requires encryption but is not the most sensitive
 */
export class WebAuxiliaryVault implements IAuxiliaryVault {
  public transactions: Map<string, Transaction>;
  public currentNetworkName: NetworkName | null;

  private isLocked: boolean;
  private encryptedVaultData: EncryptedData | null;

  public constructor(vaultData?: RawAuxiliaryVaultData) {
    this.transactions = new Map();
    this.currentNetworkName = null;
    this.isLocked = false;
    this.encryptedVaultData = null;

    if(!vaultData) {
      vaultData = this.getVaultDataFromStorage() ?? undefined;
    }

    if (!vaultData) {
      return;
    }

    this.loadVaultData(vaultData);
  }

  public save(): void {
    if (!this.isLocked) {
      throw new Error("Cannot save an unlocked auxiliary vault");
    }

    if (!this.encryptedVaultData) {
      throw new Error("Cannot save auxiliary vault without encrypted data");
    }

    localStorage.setItem(
      DEFAULT_AUXILIARY_VAULT_STORAGE_KEY,
      JSON.stringify(this.encryptedVaultData)
    );
  }

  public removeFromStorage(): void {
    localStorage.removeItem(DEFAULT_AUXILIARY_VAULT_STORAGE_KEY);
  }

  public isVaultLocked(): boolean {
    return this.isLocked;
  }

  public async lock(password: string): Promise<void> {
    if(this.isLocked) {
      return;
    }

    this.encryptedVaultData = await CryptoService.encryptWithPassword(
      this.toString(),
      password
    );
    this.transactions = new Map();
    this.currentNetworkName = null;
    this.isLocked = true;
  }

  public async unlock(password: string): Promise<void> {
    if (!this.isLocked) {
      return;
    }

    if (!this.encryptedVaultData) {
      throw new Error("Auxiliary vault was locked without encrypted data");
    }
    const decryptedData = await CryptoService.decryptWithPassword(
      this.encryptedVaultData,
      password
    );
    const storedData: StoredData = JSON.parse(decryptedData) as StoredData;

    this.transactions = this.deserializeParsedTransactions(storedData.transactions);
    this.currentNetworkName = storedData.currentNetworkName;

    this.encryptedVaultData = null;
    this.isLocked = false;
  }

  public toString(): string {
    this.ensureUnlocked();

    const storedData: StoredData = {
      transactions: this.serializeTransactions(),
      currentNetworkName: this.currentNetworkName,
    }

    return JSON.stringify(storedData);
  }

  private getVaultDataFromStorage(): RawAuxiliaryVaultData | null {
    return localStorage.getItem(DEFAULT_AUXILIARY_VAULT_STORAGE_KEY);
  }

  private loadVaultData(rawVaultData: RawAuxiliaryVaultData): void {
    const parsedVaultData = JSON.parse(rawVaultData);

    this.encryptedVaultData = parsedVaultData;
    this.isLocked = true;
  }

  private serializeTransactions(): StoredTransactions {
    return Array.from(this.transactions.entries()).map(([id, transaction]) => [
      id,
      {
        ...transaction,
        timestamp: transaction.timestamp.toISOString(),
      },
    ]);
  }

  private deserializeParsedTransactions(
    parsedTransactions: unknown
  ): Map<string, Transaction> {
    if (!Array.isArray(parsedTransactions)) {
      throw new Error("Invalid auxiliary vault data");
    }

    return new Map(
      (parsedTransactions as StoredTransactions).map(([id, transaction]) => [
        id,
        {
          ...transaction,
          timestamp: new Date(transaction.timestamp),
        },
      ])
    );
  }

  private ensureUnlocked(): void {
    if (this.isLocked) {
      throw new Error("Attempted to access locked auxiliary vault");
    }
  }
}
