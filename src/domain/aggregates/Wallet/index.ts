import WalletsService from "@services/Wallets";
import Secp256k1KeysManagerAdapter from "../../../infrastructure/adapters/KeysManager";
import type { IKeyManager } from "../../services/KeyManagement";
import type Asset from "../../Asset";
import type { Assets } from "../../Asset";
import CryptoService, {
    type EncryptedData,
} from "../../../infrastructure/adapters/Crypto";
import { validateAddress } from "@domain/services/validators";
import { sign } from "@noble/secp256k1";

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

export interface SigningCapability {
    signDigest(digest: Uint8Array): Promise<Uint8Array>;
    getPublicKey(): Uint8Array;
}

export default class Wallet {
    private static unsafeRawKeyExportEnabled = false;
    private static keyManager: Pick<IKeyManager, "getPublicKeyFromPrivateKey"> =
        new Secp256k1KeysManagerAdapter();
    private name: string;
    private address: Address;
    // private publicKey: Uint8Array;
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
        // this.publicKey = Wallet.keyManager.getKeyPairFromPrivateKey(encryptedPrivateKey);
        this.privateKey = encryptedPrivateKey;
        this.assets = new Map();
        this.isLocked = true;
    }

    public static configureKeyManager(
        keyManager: Pick<IKeyManager, "getPublicKeyFromPrivateKey">,
    ): void {
        this.keyManager = keyManager;
    }

    public static async fromPrivateKey(
        name: string,
        privateKey: Uint8Array,
        password: string,
        masterNodeId: string | null = null,
        index: number | null = null,
    ): Promise<Wallet> {
        const publicKey =
            this.keyManager.getPublicKeyFromPrivateKey(privateKey);
        const address: Address =
            WalletsService.deriveAddressFromPublicKey(publicKey);

        const encrypted: EncryptedData = await this.encryptPrivateKey(
            privateKey,
            password,
        );

        return new Wallet(name, address, encrypted, masterNodeId, index);
    }

    public static fromEncryptedData(name: string, address: Address, encryptedPrivateKey: EncryptedData, masterNodeId: string | null, index: number | null): Wallet {
        const validation = validateAddress(address);
        if (!validation.isValid) {
            throw new Error(
                `Invalid address format: ${validation.errorCode ?? "UNKNOWN"}`,
            );
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
     * @deprecated Raw key export is disabled by default. Prefer `withSigningCapability()`.
     * Enable only for legacy migration by calling `Wallet.enableUnsafeRawKeyExportForLegacyInterop()`.
     */
    public async decrypt(password: string): Promise<Uint8Array> {
        if (!Wallet.unsafeRawKeyExportEnabled) {
            throw new Error(
                "Wallet.decrypt is disabled by default for security. Use withSigningCapability() instead.",
            );
        }

        return await this.decryptPrivateKey(password);
    }

    public static enableUnsafeRawKeyExportForLegacyInterop(): void {
        Wallet.unsafeRawKeyExportEnabled = true;
    }

    public static disableUnsafeRawKeyExport(): void {
        Wallet.unsafeRawKeyExportEnabled = false;
    }

    public static isUnsafeRawKeyExportEnabled(): boolean {
        return Wallet.unsafeRawKeyExportEnabled;
    }

    private async decryptPrivateKey(password: string): Promise<Uint8Array> {
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

    public async withSigningCapability<T>(
        password: string,
        callback: (signingCapability: SigningCapability) => Promise<T> | T,
    ): Promise<T> {
        const privateKey = await this.decryptPrivateKey(password);
        const publicKey =
            Wallet.keyManager.getPublicKeyFromPrivateKey(privateKey);
        // this.publicKey = new Uint8Array(publicKey);
        let expired = false;

        const signingCapability: SigningCapability = {
            signDigest: async (digest: Uint8Array): Promise<Uint8Array> => {
                if (expired) {
                    throw new Error("Signing capability has expired");
                }

                return await sign(digest, privateKey);
            },
            getPublicKey: (): Uint8Array => {
                if (expired) {
                    throw new Error("Signing capability has expired");
                }

                return new Uint8Array(publicKey);
            },
        };

        try {
            return await callback(signingCapability);
        } finally {
            expired = true;
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

    // public getPublicKey(): Uint8Array | undefined {
    //     return this.publicKey ? new Uint8Array(this.publicKey) : undefined;
    // }

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
            // publicKey: this.publicKey ? encodeBase16(this.publicKey) : undefined,
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
