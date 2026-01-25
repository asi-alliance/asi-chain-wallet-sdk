import Asset, { Assets } from "../Asset";
import WalletsService from "../../services/Wallets";
import CryptoService, { EncryptedData } from "../../services/Crypto";
import { isAddress } from "../../utils/validators";

type AddressBrand = { readonly __brand: unique symbol };
export type Address = `1111${string & AddressBrand}`;

export interface StoredWalletMeta {
    name: string;
    address: Address;
    encryptedPrivateKey: string;
    cryptoIV: string;
    cryptoSalt: string;
    cryptoVersion: string;
    masterNodeId: string | null;
    index: string | null;
}

export type StringifiedWalletMeta = string;

export type WalletMemory = Map<string, string>;

export enum WalletMemoryKeys {
    PRIVATE_KEY = "private_key",
    CRYPTO_SALT = "crypto_salt",
    CRYPTO_IV = "crypto_iv",
    CRYPTO_VERSION = "crypto version",
}

export default class Wallet {
    private name: string;
    private address: Address;
    private privateKey: string;
    private isLocked: boolean;
    private assets: Assets;
    private memory: WalletMemory;
    private masterNodeId: string | null;
    private index: number | null;

    private constructor(
        name: string,
        address: Address,
        encryptedPrivateKey: string,
        memory: Map<string, string>,
        masterNodeId: string | null,
        index: number | null
    ) {
        this.name = name;
        this.index = index;
        this.masterNodeId = masterNodeId;
        this.address = address;
        this.privateKey = encryptedPrivateKey;
        this.memory = memory;
        this.assets = new Map();
        this.isLocked = true;
    }

    public static async fromPrivateKey(
        name: string,
        privateKey: string,
        password: string,
        masterNodeId: string | null = null,
        index: number | null = null
    ): Promise<Wallet> {
        const address: Address =
            WalletsService.deriveAddressFromPrivateKey(privateKey);

        const encrypted: EncryptedData = await this.encryptPrivateKey(
            privateKey,
            password
        );

        const memory = new Map([
            [WalletMemoryKeys.PRIVATE_KEY, encrypted.data],
            [WalletMemoryKeys.CRYPTO_IV, encrypted.iv],
            [WalletMemoryKeys.CRYPTO_SALT, encrypted.salt],
            [WalletMemoryKeys.CRYPTO_VERSION, String(encrypted.version)],
        ]);

        return new Wallet(
            name,
            address,
            encrypted.data,
            memory,
            masterNodeId,
            index
        );
    }

    public static fromEncryptedData(
        name: string,
        address: Address,
        options: {
            encryptedPrivateKey: string;
            iv: string;
            salt: string;
            version: number;
        },
        masterNodeId: string | null,
        index: number | null
    ): Wallet {
        if (!isAddress(address)) {
            throw new Error("Invalid address format");
        }

        const memory = new Map([
            [WalletMemoryKeys.PRIVATE_KEY, options.encryptedPrivateKey],
            [WalletMemoryKeys.CRYPTO_IV, options.iv],
            [WalletMemoryKeys.CRYPTO_SALT, options.salt],
            [WalletMemoryKeys.CRYPTO_VERSION, String(options.version)],
        ]);

        return new Wallet(
            name,
            address,
            options.encryptedPrivateKey,
            memory,
            masterNodeId,
            index
        );
    }

    public lock(): void {
        const privateKey: string | undefined = this.memory.get(
            WalletMemoryKeys.PRIVATE_KEY
        );

        if (!privateKey) {
            throw new Error("Memory context lost, cannot lock the Wallet");
        }

        this.privateKey = privateKey;
        this.isLocked = true;
    }

    public async unlock(password: string): Promise<void> {
        try {
            const iv: string | undefined = this.memory.get(
                WalletMemoryKeys.CRYPTO_IV
            );
            const salt: string | undefined = this.memory.get(
                WalletMemoryKeys.CRYPTO_SALT
            );
            const version: string | undefined = this.memory.get(
                WalletMemoryKeys.CRYPTO_VERSION
            );

            const encryptedPrivateKey: string = this.privateKey;

            if (!iv || !salt || !version) {
                throw new Error(
                    "Memory context lost, cannot unlock the Wallet"
                );
            }

            this.privateKey = await CryptoService.decryptWithPassword(
                { salt, iv, data: encryptedPrivateKey, version: +version },
                password
            );

            this.isLocked = false;
        } catch (error: any) {
            throw new Error("Unlock Failed: " + error?.message);
        }
    }

    public getPrivateKey(): string {
        this.ensureUnlocked();
        return this.privateKey;
    }

    public registerAsset(asset: Asset): void {
        this.assets.set(asset.getId(), asset);
    }

    public getAddress(): Address {
        return this.address;
    }

    public getName(): string {
        return this.name;
    }

    public getIndex(): number | null {
        return this.index;
    }

    public getMemory(): WalletMemory {
        return this.memory;
    }

    public getAssets(): Assets {
        return this.assets;
    }

    public isWalletLocked(): boolean {
        return this.isLocked;
    }

    public toString(): StringifiedWalletMeta {
        const meta: StoredWalletMeta = {
            name: this.name,
            address: this.address,
            encryptedPrivateKey:
                this.memory.get(WalletMemoryKeys.PRIVATE_KEY) ?? "",
            cryptoIV: this.memory.get(WalletMemoryKeys.CRYPTO_IV) ?? "",
            cryptoSalt: this.memory.get(WalletMemoryKeys.CRYPTO_SALT) ?? "",
            cryptoVersion:
                this.memory.get(WalletMemoryKeys.CRYPTO_VERSION) ?? "",
            masterNodeId: this.masterNodeId ?? "",
            index: this.index?.toString() ?? "",
        };

        return JSON.stringify(meta);
    }

    private ensureUnlocked(): void {
        if (this.isLocked) {
            throw new Error("Wallet is locked");
        }
    }

    private static async encryptPrivateKey(privateKey: string, password: string) {
        return await CryptoService.encryptWithPassword(privateKey, password);
    }
}
