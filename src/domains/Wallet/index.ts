import WalletsService from "@services/Wallets";
import Asset, { Assets } from "@domains/Asset";
import CryptoService, { EncryptedData } from "@services/Crypto";
import { isAddress } from "@utils/validators";

// TODO const AssetsCache: Map<Address, Assets> = new Map();

type AddressBrand = { readonly __brand: unique symbol };
export type Address = `1111${string & AddressBrand}`;

export interface StoredWalletMeta {
    name: string;
    address: Address;
    encryptedPrivateKey: string;
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
    private privateKey: EncryptedData;
    private isLocked: boolean;
    private assets: Assets;
    private masterNodeId: string | null;
    private index: number | null;

    private constructor(
        name: string,
        address: Address,
        encryptedPrivateKey: EncryptedData,
        masterNodeId: string | null,
        index: number | null,
    ) {
        this.name = name;
        this.index = index;
        this.masterNodeId = masterNodeId;
        this.address = address;
        this.privateKey = encryptedPrivateKey;
        this.assets = new Map();
        this.isLocked = true;
    }

    public static async fromPrivateKey(
        name: string,
        privateKey: Uint8Array,
        password: string,
        masterNodeId: string | null = null,
        index: number | null = null,
    ): Promise<Wallet> {
        const address: Address =
            WalletsService.deriveAddressFromPrivateKey(privateKey);

        const encrypted: EncryptedData = await this.encryptPrivateKey(
            privateKey,
            password,
        );

        return new Wallet(name, address, encrypted, masterNodeId, index);
    }

    public static fromEncryptedData(
        name: string,
        address: Address,
        encryptedPrivateKey: EncryptedData,
        masterNodeId: string | null,
        index: number | null,
    ): Wallet {
        if (!isAddress(address)) {
            throw new Error("Invalid address format");
        }

        return new Wallet(
            name,
            address,
            encryptedPrivateKey,
            masterNodeId,
            index,
        );
    }

    /**
     * @deprecated Prefer `withDecryptedPrivateKey()` to keep key lifetime scoped.
     */
    public async decrypt(password: string): Promise<Uint8Array> {
        try {
            const decrypted = await CryptoService.decryptWithPassword(
                this.privateKey,
                password,
            );

            const parsed = JSON.parse(decrypted);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                // convert to sorted array of numbers
                const values: number[] = Object.keys(parsed)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((k) => {
                        const v = parsed[k];
                        const num = typeof v === "string" ? Number(v) : v;
                        return typeof num === "number" && !isNaN(num) ? num : 0;
                    });
                return new Uint8Array(values);
            }
            return new Uint8Array(parsed);
        } catch (error: any) {
            throw new Error("Unlock Failed: " + error?.message);
        }
    }

    public async withDecryptedPrivateKey<T>(
        password: string,
        callback: (privateKey: Uint8Array) => Promise<T> | T,
    ): Promise<T> {
        const privateKey = await this.decrypt(password);

        try {
            return await callback(privateKey);
        } finally {
            privateKey.fill(0);
        }
    }

    public getEncryptedPrivateKey(): EncryptedData {
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
            encryptedPrivateKey: JSON.stringify(this.privateKey),
            masterNodeId: this.masterNodeId ?? "",
            index: this.index?.toString() ?? "",
        };

        return JSON.stringify(meta);
    }

    private static async encryptPrivateKey(
        privateKey: Uint8Array,
        password: string,
    ) {
        return await CryptoService.encryptWithPassword(JSON.stringify(privateKey), password);
    }
}
