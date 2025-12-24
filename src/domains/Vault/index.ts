import CryptoService, { type EncryptedData } from "../../services/crypto";
import Wallet, {
    type StringifiedWalletMeta,
    type Address,
    StoredWalletMeta,
} from "../Wallet";

export type Wallets = Map<Address, Wallet>;

export type VaultRawData = string;

export type StoredWalletsMetaRecords = Record<Address, StringifiedWalletMeta>;

export const DEFAULT_STORAGE_KEY = "0";

export default class Vault {
    private static vaultPrefix: string = `ASI_WALLETS_VAULT`;

    private isLocked: boolean;
    private wallets: Wallets;
    private encryptedVaultData: EncryptedData | null;

    constructor(VaultData?: VaultRawData) {
        console.log("Vault constructor got", VaultData);

        if (typeof window === "undefined") {
            throw new Error(
                "getVault can only be called in a browser environment"
            );
        }

        this.isLocked = false;
        this.wallets = new Map();
        this.encryptedVaultData = null;

        if (!VaultData) {
            return;
        }

        const parsedData = JSON.parse(VaultData)

        console.log("Vault constructor parsed", parsedData)

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

    public lock(password: string): void {
        this.ensureUnlocked();

        const rawVaultData: VaultRawData = this.toString();

        this.encryptedVaultData = CryptoService.encryptWithPassword(
            rawVaultData,
            password
        );

        this.isLocked = true;
        this.wallets = new Map();
    }

    public unlock(password: string): void {
        if (!this.isLocked) {
            return;
        }

        if (!this.encryptedVaultData) {
            throw new Error(
                "Vault was unlocked on undefined encryptedVaultData"
            );
        }

        const decryptedData: string = CryptoService.decryptWithPassword(
            this.encryptedVaultData,
            password
        );

        console.log("Wallet unlocked. Output data:", decryptedData);

        const parsedWalletsRawData = JSON.parse(decryptedData);

        console.log("Parsed unlocked data", parsedWalletsRawData);

        this.metaToWallets(parsedWalletsRawData);
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

            const wallet = Wallet.fromEncryptedData(
                walletMeta.name,
                {
                    address: walletMeta.address,
                    encryptedPrivateKey: walletMeta.encryptedPrivateKey,
                    iv: walletMeta.cryptoIV,
                    salt: walletMeta.cryptoSalt,
                    version: +walletMeta.cryptoVersion,
                },
                +walletMeta.index
            );

            wallets.set(address, wallet);
        });

        this.wallets = wallets;
    }

    private toString(): string {
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

        return JSON.stringify(walletsMeta);
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
