import CryptoService from "../../services/crypto";
import { WalletsService } from "../../services/WalletsService";
import Asset, { Assets } from "../Asset";

export type Address = string;
export type WalletMemory = Map<string, string>;

const enum MemoryKeys {
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
    private index: number | null;

    constructor(
        name: string,
        privateKey: string,
        password: string,
        index: number | null
    ) {
        this.name = name;
        this.index = index;
        this.address = WalletsService.deriveAddressFromPrivateKey(privateKey);

        this.memory = new Map();
        this.assets = new Map();

        this.privateKey = this.encryptPrivateKey(privateKey, password);
        this.isLocked = true;
    }

    public lock(): void {
        const privateKey: string | undefined = this.memory.get(
            MemoryKeys.PRIVATE_KEY
        );

        if (!privateKey) {
            throw new Error("Memory context lost, cannot lock the Wallet");
        }

        this.privateKey = privateKey;
        this.isLocked = true;
    }

    public unlock(password: string): void {
        try {
            const iv: string | undefined = this.memory.get(
                MemoryKeys.CRYPTO_IV
            );
            const salt: string | undefined = this.memory.get(
                MemoryKeys.CRYPTO_SALT
            );
            const version: string | undefined = this.memory.get(
                MemoryKeys.CRYPTO_VERSION
            );
            const encryptedPrivateKey: string = this.privateKey;

            if (!iv || !salt || !version) {
                throw new Error(
                    "Memory context lost, cannot unlock the Wallet"
                );
            }

            this.privateKey = CryptoService.decryptWithPassword(
                { salt, iv, data: encryptedPrivateKey, version: +version },
                password
            );

            this.isLocked = false;
        } catch (error: any) {
            throw new Error("Unlock Failed: " + error?.message);
        }
    }

    public registerAsset(asset: Asset): void {
        this.assets.set(asset.getId(), asset);
    }

    public getAddress(): string {
        return this.address;
    }

    public transfer(): void {}

    private encryptPrivateKey(privateKey: string, password: string) {
        const encryptedPrivateKeyData = CryptoService.encryptWithPassword(
            privateKey,
            password
        );

        this.memory.set(MemoryKeys.PRIVATE_KEY, encryptedPrivateKeyData.data);
        this.memory.set(MemoryKeys.CRYPTO_IV, encryptedPrivateKeyData.iv);
        this.memory.set(MemoryKeys.CRYPTO_SALT, encryptedPrivateKeyData.salt);
        this.memory.set(
            MemoryKeys.CRYPTO_VERSION,
            encryptedPrivateKeyData.version.toString()
        );

        return encryptedPrivateKeyData.data;
    }
}
