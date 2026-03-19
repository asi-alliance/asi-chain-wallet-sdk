import CryptoService, { type EncryptedData } from "@services/Crypto";
import EncryptedRecord from "@domains//EncryptedRecord";
import Wallet, {
    type StringifiedWalletMeta,
    type Address,
    StoredWalletMeta,
} from "@domains/Wallet";

export type Wallets = Map<Address, Wallet>;

export type Seeds = Map<string, EncryptedRecord>;

export type VaultRawData = string;

export type StoredWalletsMetaRecords = Record<Address, StringifiedWalletMeta>;

export type StoredSeedsMetaRecords = Record<string, string>;

export const DEFAULT_STORAGE_KEY = "0";

const DEFAULT_SEED_ID_LENGTH: number = 16;

export default class Vault {
    private static vaultPrefix: string = `ASI_WALLETS_VAULT`;

    private isLocked: boolean;
    private wallets: Wallets;
    private seeds: Seeds;
    private encryptedVaultData: EncryptedData | null;

    constructor(VaultData?: VaultRawData) {
        if (typeof window === "undefined") {
            throw new Error(
                "getVault can only be called in a browser environment"
            );
        }

        this.isLocked = false;
        this.wallets = new Map();
        this.seeds = new Map();
        this.encryptedVaultData = null;

        if (!VaultData) {
            return;
        }

        const parsedData = JSON.parse(VaultData);

        this.encryptedVaultData = parsedData;
        this.isLocked = true;
    }

    public static getSavedVaultKeys(): string[] {
        this.ensureBrowserEnvironment();

        const keys: string[] = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key: string | null = localStorage.key(i);

            if (key && key.startsWith(this.vaultPrefix)) {
                keys.push(key);
            }
        }

        return keys;
    }

    public static getVaultDataFromStorage(
        vaultKey: string
    ): VaultRawData | null {
        this.ensureBrowserEnvironment();

        return localStorage.getItem(vaultKey);
    }

    public isVaultLocked(): boolean {
        return this.isLocked;
    }

    public save(vaultKey: string = DEFAULT_STORAGE_KEY): void {
        Vault.ensureBrowserEnvironment();

        if (!this.isLocked) {
            throw new Error("Cannot save an unlocked vault");
        }

        const storageKey: string = `${Vault.vaultPrefix}_${vaultKey}`;

        localStorage.setItem(
            storageKey,
            JSON.stringify(this.encryptedVaultData)
        );
    }

    public async lock(password: string): Promise<void> {
        this.ensureUnlocked();

        const rawVaultData: VaultRawData = this.toString();

        this.encryptedVaultData = await CryptoService.encryptWithPassword(
            rawVaultData,
            password
        );

        this.wallets = new Map();
        this.seeds = new Map();
        this.isLocked = true;
    }

    public async unlock(password: string): Promise<void> {
        if (!this.isLocked) {
            return;
        }

        if (!this.encryptedVaultData) {
            throw new Error(
                "Vault was unlocked on undefined encryptedVaultData"
            );
        }

        const decryptedData: string = await CryptoService.decryptWithPassword(
            this.encryptedVaultData,
            password
        );

        const { wallets, seeds } = JSON.parse(decryptedData);

        this.metaToWallets(wallets);
        this.metaToSeeds(seeds);

        this.isLocked = false;
    }

    public isEmpty(): boolean {
        this.ensureUnlocked();

        return this.wallets.size === 0;
    }

    public getWallets(): Wallet[] {
        return Array.from(this.wallets.values());
    }

    public getWalletsCount(): number {
        this.ensureUnlocked();

        return this.wallets.size;
    }

    public getWalletAddresses(): Address[] {
        this.ensureUnlocked();

        return Array.from(this.wallets.keys());
    }

    public addWallet(wallet: Wallet): void {
        this.ensureUnlocked();

        this.wallets.set(wallet.getAddress(), wallet);
    }

    public removeWallet(address: Address): void {
        this.ensureUnlocked();

        this.wallets.delete(address);
    }

    public getWallet(address: Address): Wallet | undefined {
        this.ensureUnlocked();

        return this.wallets.get(address);
    }

    public hasWallet(address: Address): boolean {
        this.ensureUnlocked();

        return this.wallets.has(address);
    }

    public hasSeed(seedId: string): boolean {
        this.ensureUnlocked();

        return this.seeds.has(seedId);
    }

    private metaToWallets(meta: StoredWalletsMetaRecords): void {
        const wallets: Wallets = new Map();
        const addresses: Address[] = Object.keys(meta) as Address[];

        addresses.forEach((address: Address) => {
            const walletMeta: StoredWalletMeta = JSON.parse(meta[address]);

            const wallet = Wallet.fromEncryptedData(
                walletMeta.name,
                walletMeta.address,
                JSON.parse(walletMeta.encryptedPrivateKey),
                walletMeta.masterNodeId,
                !walletMeta.index ? null : +walletMeta.index
            );

            wallets.set(address, wallet);
        });

        this.wallets = wallets;
    }

    private metaToSeeds(meta: StoredSeedsMetaRecords): void {
        const seeds: Seeds = new Map();
        const ids: string[] = Object.keys(meta);

        ids.forEach((id: string) => {
            const seed = EncryptedRecord.createFromStringifiedEncryptedData(
                meta[id],
            );

            seeds.set(id, seed);
        });

        this.seeds = seeds;
    }

    public getSeeds(): EncryptedRecord[] {
        this.ensureUnlocked();

        return Array.from(this.seeds.values());
    }

    public getSeed(id: string): EncryptedRecord | undefined {
        this.ensureUnlocked();

        return this.seeds.get(id);
    }

    public addSeed(id: string, seed: EncryptedRecord): void {
        this.ensureUnlocked();

        this.seeds.set(id, seed);
    }

    public removeSeed(id: string): void {
        this.ensureUnlocked();

        this.seeds.delete(id);
    }

    public getSeedsIds(): string[] {
        this.ensureUnlocked();

        return Array.from(this.seeds.keys());
    }

    public toString(): string {
        const seedsMeta: StoredSeedsMetaRecords = {};
        const walletsMeta: StoredWalletsMetaRecords = {};

        this.ensureUnlocked();

        const addresses: Address[] = this.getWalletAddresses();
        const seedsIds: string[] = this.getSeedsIds();

        addresses.forEach((address: Address) => {
            const wallet: Wallet | undefined = this.getWallet(address);

            if (!wallet) {
                return;
            }

            walletsMeta[address] = wallet.toString();
        });

        seedsIds.forEach((seedId: string) => {
            const seed: EncryptedRecord | undefined = this.getSeed(seedId);

            if (!seed) {
                return;
            }

            seedsMeta[seedId] = seed.toString();
        });

        return JSON.stringify({
            wallets: walletsMeta,
            seeds: seedsMeta,
        });
    }

    private ensureUnlocked(): void {
        if (this.isLocked) {
            throw new Error("Attempted to access locked vault");
        }
    }

    private static ensureBrowserEnvironment(): void {
        if (typeof window === "undefined") {
            throw new Error(
                "getVault can only be called in a browser environment"
            );
        }
    }
}
