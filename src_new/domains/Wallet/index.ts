import Asset, { Assets } from "@domains/Asset";
import WalletsService from "@services/Wallets";
import KeysManager from "@services/KeysManager";
import CryptoService, { EncryptedData } from "@services/Crypto";
import { validateAddress } from "@utils/validators";
import {
    generateRandomId,
    getHDWalletOptions,
    stringifyPrivateKeyToUnitArray,
} from "@utils/index";
import { sign } from "@noble/secp256k1";
import {
    TPasswordProvider,
    TPrivateKeyPasswordProvider,
} from "@domains/PasswordProvider";
import { WalletTypes } from "@domains/WalletsStorageRepository";
import { isCustomCreateHDWalletOptions } from "@utils/guards";

type AddressBrand = { readonly __brand: unique symbol };
export type Address = `1111${string & AddressBrand}`;

export interface StoredWalletMeta {
    id: string;
    name: string;
    address: Address;
    encryptedData: string;
    index: string | null;
}

export interface IWalletOptions {
    name: string;
    address: Address;
    encryptedData: EncryptedData;
    index?: number | null;
    id?: string;
}

export interface ICreateHDWalletDefaultOptions {
    id?: string;
    name: string;
    passwordProvider: TPasswordProvider;
    hdWalletOptions: TCreateHDWalletOptions;
}

export interface IWalletEncryptedFields {
    keyData: Uint8Array;
    depth: number | null;
    HDPath: string | null;
}

export type TCreateHDWalletOptions =
    | {
          customHDPath: string;
      }
    | {
          index: number;
      };

export interface ICreateWalletFromMnemonicPayload extends ICreateHDWalletDefaultOptions {
    mnemonic: string;
}

export interface ICreateWalletFromSeedPayload extends ICreateHDWalletDefaultOptions {
    seed: Uint8Array;
}

export interface ICreatedHDWalletData {
    wallet: Wallet;
    path: string;
    index: number;
    seed: Uint8Array;
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
    private id: string;
    private name: string;
    private address: Address;
    private type: WalletTypes;
    private encryptedData: EncryptedData;
    private isLocked: boolean;
    private assets: Assets;
    private index: number | null;

    private constructor({
        name,
        address,
        encryptedData,
        index,
        id,
    }: IWalletOptions) {
        this.id = id ?? generateRandomId();
        this.name = name;
        this.index = index ?? null;
        this.address = address;
        this.encryptedData = encryptedData;
        this.assets = new Map();
        this.isLocked = true;
        this.type = index ? WalletTypes.HD : WalletTypes.PRIVATE_KEY;
    }

    public static async fromPrivateKey(
        name: string,
        passwordProvider: TPrivateKeyPasswordProvider,
        id?: string,
    ): Promise<Wallet> {
        const { privateKey, password } = await passwordProvider();

        const address: Address =
            WalletsService.deriveAddressFromPrivateKey(privateKey);

        const encrypted: EncryptedData = await this.encryptPrivateData(
            { keyData: privateKey, HDPath: null, depth: null },
            password,
        );

        return new Wallet({
            id,
            name,
            address,
            encryptedData: encrypted,
        });
    }

    public static async fromMnemonic({
        mnemonic,
        name,
        passwordProvider,
        hdWalletOptions,
        id,
    }: ICreateWalletFromMnemonicPayload): Promise<ICreatedHDWalletData> {
        const { password } = await passwordProvider();

        const { privateKey, seed, path } =
            await KeysManager.getPrivateDataFromMnemonic(
                mnemonic,
                hdWalletOptions,
            );

        const address: Address =
            WalletsService.deriveAddressFromPrivateKey(privateKey);

        const currentIndex: number = !isCustomCreateHDWalletOptions(
            hdWalletOptions,
        )
            ? hdWalletOptions.index
            : 0;

        const encryptedData: EncryptedData = await this.encryptPrivateData(
            {
                keyData: seed,
                HDPath: path,
                depth: currentIndex,
            },
            password,
        );

        return {
            wallet: new Wallet({
                id,
                name,
                address,
                encryptedData,
                index: currentIndex,
            }),
            path,
            index: currentIndex,
            seed,
        };
    }

    public static async fromSeed({
        seed,
        name,
        passwordProvider,
        hdWalletOptions,
        id,
    }: ICreateWalletFromSeedPayload): Promise<ICreatedHDWalletData> {
        const { password } = await passwordProvider();

        const { privateKey, path, index } =
            await KeysManager.getPrivateDataFromSeed(seed, hdWalletOptions);

        const address: Address =
            WalletsService.deriveAddressFromPrivateKey(privateKey);

        const encryptedData: EncryptedData = await this.encryptPrivateData(
            { keyData: seed, HDPath: path, depth: index },
            password,
        );

        return {
            wallet: new Wallet({
                id,
                name,
                address,
                encryptedData,
                index,
            }),
            path,
            index,
            seed,
        };
    }

    public static fromEncryptedData({
        id,
        name,
        address,
        encryptedData,
        index,
    }: IWalletOptions): Wallet {
        const validation = validateAddress(address);
        if (!validation.isValid) {
            throw new Error(
                `Invalid address format: ${validation.errorCode ?? "UNKNOWN"}`,
            );
        }

        return new Wallet({
            id,
            name,
            address,
            encryptedData,
            index,
        });
    }

    /**
     * @deprecated Raw key export is disabled by default. Prefer `withSigningCapability()`.
     * Enable only for legacy migration by calling `Wallet.enableUnsafeRawKeyExportForLegacyInterop()`.
     */
    public async decrypt(
        passwordProvider: TPasswordProvider,
    ): Promise<Uint8Array> {
        if (!Wallet.unsafeRawKeyExportEnabled) {
            throw new Error(
                "Wallet.decrypt is disabled by default for security. Use withSigningCapability() instead.",
            );
        }

        return await this.decryptPrivateKey(passwordProvider);
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

    private async decryptPrivateKey(
        passwordProvider: TPasswordProvider,
    ): Promise<Uint8Array> {
        const { password } = await passwordProvider();

        try {
            const decrypted = await CryptoService.decryptWithPassword(
                this.encryptedData,
                password,
            );

            const {
                keyData: stringifyKeyData,
                depth,
                HDPath,
            } = JSON.parse(decrypted) as Omit<
                IWalletEncryptedFields,
                "keyData"
            > & { keyData: string };

            const keyData: Uint8Array =
                stringifyPrivateKeyToUnitArray(stringifyKeyData);

            if (!depth && !HDPath) {
                return keyData;
            }

            const { privateKey } = await KeysManager.getPrivateDataFromSeed(
                keyData,
                getHDWalletOptions(HDPath, depth),
            );

            return privateKey;
        } catch (error: any) {
            throw new Error("Unlock Failed: " + error?.message);
        }
    }

    public async withSigningCapability<T>(
        passwordProvider: TPasswordProvider,
        callback: (signingCapability: SigningCapability) => Promise<T> | T,
    ): Promise<T> {
        const privateKey = await this.decryptPrivateKey(passwordProvider);
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

                return KeysManager.getPublicKeyFromPrivateKey(privateKey);
            },
        };

        try {
            return await callback(signingCapability);
        } finally {
            expired = true;
            privateKey.fill(0);
        }
    }

    public getEncryptedPrivateData(): EncryptedData {
        return this.encryptedData;
    }

    public registerAsset(asset: Asset): void {
        this.assets.set(asset.getId(), asset);
    }

    public getId(): string {
        return this.id;
    }

    public getAddress(): Address {
        return this.address;
    }

    public getType(): WalletTypes {
        return this.type;
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
            id: this.id,
            name: this.name,
            address: this.address,
            encryptedData: JSON.stringify(this.encryptedData),
            index: this.index?.toString() ?? "",
        };

        return JSON.stringify(meta);
    }

    private static async encryptPrivateData(
        privateData: IWalletEncryptedFields,
        password: string,
    ) {
        return await CryptoService.encryptWithPassword(
            JSON.stringify(privateData),
            password,
        );
    }
}
