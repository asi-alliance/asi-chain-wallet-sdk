import CryptoService, { type EncryptedData } from "@services/Crypto";
import EncryptedRecord from "@domains//EncryptedRecord";
import Wallet, {
    type StringifiedWalletMeta,
    type Address,
    StoredWalletMeta,
} from "@domains/Wallet";
import { IVault } from "../../application/ports/outbound/IVault";
import { IUiEventDispatcher } from "../../application/ports/outbound/IUiEventDispatcher";

export type Wallets = Map<Address, Wallet>;

export type Seeds = Map<string, EncryptedRecord>;

export type RawVaultData = string;

export type StoredWalletsMetaRecords = Record<Address, StringifiedWalletMeta>;

export type StoredSeedsMetaRecords = Record<string, string>;

const DEFAULT_VAULT_STORAGE_KEY = "ASI_WALLETS_VAULT";

/**
 * page-context IVault implementation. Intended for web page environment only. Not for extension. Do not use in extension. Designed to store the most sensitive data.
 */
export default class WebVault implements IVault {
    private isLocked: boolean;

    private wallets: Wallets;
    private seeds: Seeds;
    
    private encryptedVaultData: EncryptedData | null;
    public _uiEventDispatcher: IUiEventDispatcher | null = null;
    public get uiEventDispatcher() {
        if(!this._uiEventDispatcher) {
            throw new Error;
        }
        return this._uiEventDispatcher;
    }
    public set uiEventDispatcher(value: IUiEventDispatcher) {
        this._uiEventDispatcher = value;
    }

    constructor(vaultData?: RawVaultData) {
        this.isLocked = false;
        this.wallets = new Map();
        this.seeds = new Map();
        this.encryptedVaultData = null;

        if(!vaultData) {
            vaultData = this.getVaultDataFromStorage() ?? undefined;
        }
        
        if (!vaultData) {
            return;
        }

        const parsedData = JSON.parse(vaultData);

        this.encryptedVaultData = parsedData;
        this.isLocked = true;
    }

    private getVaultDataFromStorage(): RawVaultData | null {
        return localStorage.getItem(DEFAULT_VAULT_STORAGE_KEY);
    }

    /* vault management */
    public isEmpty(): boolean {
        this.ensureUnlocked();
        return this.wallets.size === 0 && this.seeds.size === 0;
    }
    public isVaultLocked(): boolean {
        return this.isLocked;
    }

    public clearSavedVault(): void {
        localStorage.removeItem(DEFAULT_VAULT_STORAGE_KEY);
    }
    public save(): void {
        if (!this.isLocked) {
            throw new Error("Cannot save an unlocked vault");
        }

        localStorage.setItem(DEFAULT_VAULT_STORAGE_KEY, JSON.stringify(this.encryptedVaultData));
        this.uiEventDispatcher.onVaultChanged?.();
    }
    public async lock(password: string): Promise<void> {
        this.ensureUnlocked();

        const rawVaultData: RawVaultData = this.toString();

        this.encryptedVaultData = await CryptoService.encryptWithPassword(
            rawVaultData,
            password
        );

        this.wallets = new Map();
        this.seeds = new Map();
        this.isLocked = true;
    }
    public async unlock(password: string): Promise<void> {
        console.log("unlock: start")
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
        const parsedDecryptedData = JSON.parse(decryptedData);
        const { wallets, seeds } = parsedDecryptedData;

        this.metaToWallets(wallets);
        this.metaToSeeds(seeds);

        this.isLocked = false;
        console.log("point1")
        this.uiEventDispatcher.onVaultChanged?.();
        console.log("point2")
    }
    /* vault management */

    /* wallets */
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
    public getWallet(address: Address): Wallet | undefined {
        this.ensureUnlocked();
        return this.wallets.get(address);
    }
    public addWallet(wallet: Wallet): void {
        this.ensureUnlocked();
        this.wallets.set(wallet.getAddress(), wallet);
    }
    public removeWallet(address: Address): void {
        this.ensureUnlocked();
        this.wallets.delete(address);
    }
    public hasWallet(address: Address): boolean {
        this.ensureUnlocked();
        return this.wallets.has(address);
    }
    /* /wallets */

    /* seeds */
    public hasSeed(seedId: string): boolean {
        this.ensureUnlocked();
        return this.seeds.has(seedId);
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
    /* /seeds */

    /* mappers */
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
                !walletMeta.index ? null : +walletMeta.index,
                // walletMeta.publicKey ?? null,
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
    /* /mappers */

    /* guards */
    private ensureUnlocked(): void {
        if (this.isLocked) {
            throw new Error("Attempted to access locked vault");
        }
    }
    /* /guards */
}
