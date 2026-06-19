import StoreManager from "@services/StoreManager";
import CryptoService, { type EncryptedData } from "@services/Crypto";
import Wallet, {
    type StringifiedWalletMeta,
    type Address,
    StoredWalletMeta,
} from "@domains/Wallet";

export type Wallets = Map<Address, Wallet>;

export type VaultRawData = string;

export type StoredWalletsMetaRecords = Record<Address, StringifiedWalletMeta>;

export const DEFAULT_STORAGE_KEY = "0";

export default class Vault {
    private isLocked: boolean;
    private wallets: Wallets;
    private encryptedVaultData: EncryptedData | null;

    constructor(VaultData?: VaultRawData) {
        if (typeof window === "undefined") {
            throw new Error(
                "getVault can only be called in a browser environment",
            );
        }

        this.isLocked = false;
        this.wallets = new Map();
        this.encryptedVaultData = null;

        if (!VaultData) {
            return;
        }

        const parsedData = JSON.parse(VaultData);

        this.encryptedVaultData = parsedData;
        this.isLocked = true;
    }

    public isVaultLocked(): boolean {
        return this.isLocked;
    }

    public save(vaultKey: string = DEFAULT_STORAGE_KEY): void {
        Vault.ensureBrowserEnvironment();

        if (!this.isLocked) {
            throw new Error("Cannot save an unlocked vault");
        }

        // const storageKey: string = `${Vault.vaultPrefix}_${vaultKey}`;

        // localStorage.setItem(
        //     storageKey,
        //     JSON.stringify(this.encryptedVaultData),
        // );

        StoreManager.saveWallets(this.getWallets());
    }

    public async lock(password: string): Promise<void> {
        this.ensureUnlocked();

        const rawVaultData: VaultRawData = this.toString();

        this.encryptedVaultData = await CryptoService.encryptWithPassword(
            rawVaultData,
            password,
        );

        this.wallets = new Map();
        this.isLocked = true;
    }

    public async unlock(password: string): Promise<void> {
        if (!this.isLocked) {
            return;
        }

        if (!this.encryptedVaultData) {
            throw new Error(
                "Vault was unlocked on undefined encryptedVaultData",
            );
        }

        const decryptedData: string = await CryptoService.decryptWithPassword(
            this.encryptedVaultData,
            password,
        );

        const { wallets } = JSON.parse(decryptedData);

        this.metaToWallets(wallets);

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

    private metaToWallets(meta: StoredWalletsMetaRecords): void {
        const wallets: Wallets = new Map();
        const addresses: Address[] = Object.keys(meta) as Address[];

        addresses.forEach((address: Address) => {
            const walletMeta: StoredWalletMeta = JSON.parse(meta[address]);

            const wallet = Wallet.fromEncryptedData({
                id: walletMeta.id,
                name: walletMeta.name,
                address: walletMeta.address,
                encryptedData: JSON.parse(walletMeta.encryptedData),
                seed: walletMeta.seed ?? null,
                index: Number(walletMeta.index) ?? null,
            });

            wallets.set(address, wallet);
        });

        this.wallets = wallets;
    }

    public toString(): string {
        const walletsMeta: StoredWalletsMetaRecords = {};

        this.ensureUnlocked();

        const addresses: Address[] = this.getWalletAddresses();

        addresses.forEach((address: Address) => {
            const wallet: Wallet | undefined = this.getWallet(address);

            if (!wallet) {
                return;
            }

            walletsMeta[address] = wallet.toString();
        });

        return JSON.stringify({
            wallets: walletsMeta,
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
                "getVault can only be called in a browser environment",
            );
        }
    }
}
