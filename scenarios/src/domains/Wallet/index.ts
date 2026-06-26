import Signer, { ISignerRecord } from "../Signer";
import Account, {
    IAccountOptions,
    IAccountRecord,
    TCreateAccountPayload,
} from "../Account";
import { createSigner, restoreSigner } from "../../utils/fabrics/signer";
import { generateRandomId } from "../../utils";
import SecretsProvider, {
    IHDSecret,
    IHDSecretRecord,
    IPasswordCredentials,
    IPrivateKeyCredentials,
} from "../SecretsProvider";
import KeysManager from "../../services/KeysManager";
import Bip44Path from "../Bip44Path";

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

export type TCreateHDWalletOptions =
    | {
          customHDPath: Bip44Path;
      }
    | {
          index: number;
      };

export enum WalletTypes {
    PRIVATE_KEY = "private-key",
    HD = "hd",
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
        accountOptions: TCreateAccountPayload,
        passwordProvider: SecretsProvider<IPasswordCredentials>,
        secretProvider: SecretsProvider<IPrivateKeyCredentials>,
    ): Promise<Wallet> {
        const signer: Signer = await createSigner({
            type: WalletTypes.PRIVATE_KEY,
            passwordProvider,
            secretProvider,
        });

        const firstAccountId: string = generateRandomId();
        const firstAccount: Account = await Account.create(
            accountOptions,
            secretProvider,
        );

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
        accountOptions: TCreateAccountPayload,
        passwordProvider: SecretsProvider<IPasswordCredentials>,
        mnemonic: string,
        hdWalletOptions: TCreateHDWalletOptions,
    ): Promise<Wallet> {
        const { seed, path: rootHDPath } =
            await KeysManager.getPrivateDataFromMnemonic(
                mnemonic,
                hdWalletOptions,
            );

        const secretProviderFromSigner: SecretsProvider<IHDSecretRecord> =
            new SecretsProvider(() => {
                return {
                    rootHDPath: rootHDPath.toString(),
                    seed,
                };
            });

        const signer: Signer = await createSigner({
            type: WalletTypes.HD,
            passwordProvider,
            secretProvider: secretProviderFromSigner,
        });

        const secretProviderFromAccount: SecretsProvider<IHDSecret> =
            new SecretsProvider(() => {
                return {
                    rootHDPath: rootHDPath,
                    seed,
                };
            });

        const firstAccountId: string = generateRandomId();
        const firstAccount: Account = await Account.create(
            accountOptions,
            secretProviderFromAccount,
        );

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

    public static async restore(
        passwordProvider: SecretsProvider<IPasswordCredentials>,
        signerRecord: ISignerRecord,
        accountRecords: IAccountRecord[],
    ): Promise<Wallet> {
        const signer: Signer = restoreSigner({
            type: signerRecord.type,
            encryptedData: signerRecord.encryptedData,
        });

        const secretData: IPrivateKeyCredentials | IHDSecret =
            await signer.decrypt(passwordProvider);
        const secretProvider = new SecretsProvider(() => secretData);

        const accounts: [string, Account][] = await Promise.all(
            accountRecords.map(async (record: IAccountRecord) => {
                const account = await Account.create(
                    {
                        name: record.name,
                    },
                    secretProvider,
                );

                return [record.id, account];
            }),
        );

        const accountsMap: Map<string, Account> = new Map(accounts);

        return new Wallet({
            type: signerRecord.type,
            signer,
            accounts: accountsMap,
        });
    }
}
