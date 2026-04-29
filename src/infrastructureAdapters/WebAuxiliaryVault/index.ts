import CryptoService, { type EncryptedData } from "@services/Crypto";
import { Transaction } from "@domains/Transaction";
import { IAuxiliaryVault } from "../../application/ports/outbound/IAuxiliaryVault";

const DEFAULT_AUXILIARY_VAULT_STORAGE_KEY = "ASI_AUXILLIARY_VAULT";

export type RawAuxiliaryVaultData = string;

type StoredTransaction = Omit<Transaction, "timestamp"> & {
  timestamp: string;
};

type StoredTransactions = Array<[string, StoredTransaction]>;

/**
 * Auxiliary storage for storing data that requires encryption but is not the most sensitive
 */
export class WebAuxiliaryVault implements IAuxiliaryVault {
  public transactions: Map<string, Transaction>;

  private isLocked: boolean;
  private encryptedVaultData: EncryptedData | null;

  public constructor(vaultData?: RawAuxiliaryVaultData) {
    this.transactions = new Map();
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
    this.ensureUnlocked();

    this.encryptedVaultData = await CryptoService.encryptWithPassword(
      this.toString(),
      password
    );
    this.transactions = new Map();
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

    this.transactions = this.deserializeTransactions(decryptedData);
    this.encryptedVaultData = null;
    this.isLocked = false;
  }

  public toString(): string {
    this.ensureUnlocked();

    return JSON.stringify(this.serializeTransactions());
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

  private deserializeTransactions(rawTransactions: string): Map<string, Transaction> {
    return this.deserializeParsedTransactions(JSON.parse(rawTransactions));
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
