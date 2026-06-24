import Signer from "../Signer";
import Account, { IAccountOptions } from "../Account";
import { WalletTypes } from "@domains/WalletsStorageRepository";
import { createSigner } from "../../utils/fabrics/signer";
import { generateRandomId } from "@utils/index";
import {
    IHDSecret,
    IPrivateKeyCredentials,
    TPasswordProvider,
} from "@domains/PasswordProvider";

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
    id?: string;
    type: WalletTypes;
    signer: Signer;
    accounts: Map<string, Account>;
    activeAccount?: Account;
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
    private id: string;
    private type: WalletTypes;
    private signer: Signer;
    private accounts: Map<string, Account>;
    private activeAccount: Account | null;

    private constructor({
        id,
        type,
        signer,
        accounts,
        activeAccount,
    }: IWalletOptions) {
        this.id = id ?? generateRandomId();
        this.type = type;
        this.signer = signer;
        this.accounts = accounts;
        this.activeAccount = activeAccount ?? null;
    }

    public getId(): string {
        return this.id;
    }

    public getType(): WalletTypes {
        return this.type;
    }

    public getSigner(): Signer {
        return this.signer;
    }

    public getAccounts(): Map<string, Account> {
        return this.accounts;
    }

    public getActiveAccount(): Account | null {
        return this.activeAccount;
    }

    public static async createPk(
        accountOptions: IAccountOptions,
        passwordProvider: TPasswordProvider,
        secretData: IPrivateKeyCredentials,
    ): Promise<Wallet> {
        const secretProvider = async () => {
            return secretData;
        };

        const signer: Signer = await createSigner({
            type: WalletTypes.PRIVATE_KEY,
            passwordProvider,
            secretProvider,
        });

        const firstAccountId: string = generateRandomId();
        const firstAccount: Account = new Account(accountOptions);

        const accounts: Map<string, Account> = new Map([
            [firstAccountId, firstAccount],
        ]);

        return new Wallet({
            type: WalletTypes.PRIVATE_KEY,
            signer,
            accounts,
            activeAccount: firstAccount,
        });
    }

    public static async createHD(
        accountOptions: IAccountOptions,
        passwordProvider: TPasswordProvider,
        secretData: IHDSecret,
    ): Promise<Wallet> {
        const secretProvider = async () => {
            return secretData;
        };

        const signer: Signer = await createSigner({
            type: WalletTypes.HD,
            passwordProvider,
            secretProvider,
        });

        const firstAccountId: string = generateRandomId();
        const firstAccount: Account = new Account(accountOptions);

        const accounts: Map<string, Account> = new Map([
            [firstAccountId, firstAccount],
        ]);

        return new Wallet({
            type: WalletTypes.HD,
            signer,
            accounts,
            activeAccount: firstAccount,
        });
    }
}
