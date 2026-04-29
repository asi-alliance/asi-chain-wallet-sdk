import type EncryptedRecord from "@domains/EncryptedRecord";
import type Wallet from "@domains/Wallet";
import type { Address } from "@domains/Wallet";

export interface IVault {
    isEmpty(): boolean;
    isVaultLocked(): boolean;
    clearSavedVault(): void;
    save(): void;
    lock(password: string): Promise<void>;
    unlock(password: string): Promise<void>;

    getWallets(): Wallet[];
    getWalletsCount(): number;
    getWalletAddresses(): Address[];
    getWallet(address: Address): Wallet | undefined;
    addWallet(wallet: Wallet): void;
    removeWallet(address: Address): void;
    hasWallet(address: Address): boolean;

    hasSeed(seedId: string): boolean;
    getSeeds(): EncryptedRecord[];
    getSeed(id: string): EncryptedRecord | undefined;
    addSeed(id: string, seed: EncryptedRecord): void;
    removeSeed(id: string): void;
    getSeedsIds(): string[];

    toString(): string;
}
