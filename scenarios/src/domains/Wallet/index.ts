import Signer, { ISignerRecord } from "../Signer";
import Account, {
    IAccountRecord,
    TCreateAccountPayload,
    TEditableAccountOptions,
} from "../Account";
import { createSigner, restoreSigner } from "../../utils/fabrics/signer";
import { decryptSignerData, generateRandomId } from "../../utils";
import SecretsProvider, {
    IHDSecret,
    IPrivateKeyCredentials,
} from "../SecretsProvider";
import KeysManager from "../../services/KeysManager";
import Bip44Path from "../Bip44Path";
import AccountManager from "../../services/AccountManager";
import { OnlyHDWallet } from "../../utils/decorators";

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

export type TCreateHDPathWalletOptions =
    | {
          customHDPath: Bip44Path;
      }
    | {
          index: number;
      };

export interface ICreateHDWalletOptions {
    mnemonic: string;
    pathOptions: TCreateHDPathWalletOptions;
    accountOptions: TCreateAccountPayload;
}

export interface IRestoreWalletPayload {
    signerRecord: ISignerRecord;
    accountRecords: IAccountRecord[];
}

export enum WalletTypes {
    PRIVATE_KEY = "private-key",
    HD = "hd",
}

export default class Wallet {
    private readonly id: string;
    private readonly type: WalletTypes;
    private readonly signer: Signer;
    private readonly accountManager: AccountManager;

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
        this.accountManager = new AccountManager(
            accounts,
            activeAccount ?? null,
        );
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

    public getAccounts(): Account[] {
        return this.accountManager.getAccounts();
    }

    public getAccountsMap(): Map<string, Account> {
        return this.accountManager.getAccountsMap();
    }

    public getActiveAccount(): Account | null {
        return this.accountManager.getActiveAccount();
    }

    public setActiveAccount(id: string): void {
        this.accountManager.setActiveAccount(id);
    }

    private getDerivationIndex(initialHDPath: Bip44Path): number | null {
        const initialAccountIndex = initialHDPath.getIndex();

        const indexes = this.getAccounts()
            .map((account: Account) => account.getIndex())
            .filter((index: number | null): index is number => index !== null)
            .sort((a, b) => a - b);

        if (!indexes.length) {
            return initialAccountIndex;
        }

        let expectedIndex = initialAccountIndex + 1;

        for (const index of indexes) {
            if (index === expectedIndex) {
                expectedIndex++;

                continue;
            }

            if (index > expectedIndex) {
                return expectedIndex;
            }
        }

        return expectedIndex;
    }

    @OnlyHDWallet
    public async deriveAccount(
        payload: Omit<TCreateAccountPayload, "index">,
        passwordProvider: SecretsProvider,
    ): Promise<Account> {
        const secretData = (await decryptSignerData(
            this.signer.getEncryptedSecret(),
            passwordProvider,
        )) as IHDSecret;
        const secretProvider = new SecretsProvider(() => secretData);

        const derivationIndex: number | null = this.getDerivationIndex(
            secretData.rootHDPath,
        );

        return this.accountManager.create(
            { ...payload, index: derivationIndex ?? undefined },
            secretProvider,
        );
    }

    public removeAccount(id: string): boolean {
        return this.accountManager.remove(id);
    }

    public updateAccount(id: string, payload: TEditableAccountOptions): void {
        this.accountManager.update(id, payload);
    }

    public static async createPk(
        accountOptions: TCreateAccountPayload,
        secretProvider: SecretsProvider,
    ): Promise<Wallet> {
        const signer: Signer = await createSigner({
            type: WalletTypes.PRIVATE_KEY,
            secretProvider,
        });

        const initialAccountId: string = generateRandomId();
        const initialAccount: Account = await Account.create(
            accountOptions,
            new SecretsProvider(() => secretProvider.getSecret().secret),
        );

        const accounts: Map<string, Account> = new Map([
            [initialAccountId, initialAccount],
        ]);

        return new Wallet({
            type: WalletTypes.PRIVATE_KEY,
            signer,
            accounts,
            activeAccount: initialAccount,
        });
    }

    public static async createHD(
        options: ICreateHDWalletOptions,
        passwordProvider: SecretsProvider,
    ): Promise<Wallet> {
        const rootHDPath = await KeysManager.getInitialHDPathFromOptions(
            options.pathOptions,
        );

        const secretProviderFromSigner: SecretsProvider = new SecretsProvider(
            () => {
                return {
                    secret: {
                        rootHDPath: rootHDPath.toString(),
                        seed: options.mnemonic,
                    },
                    password: passwordProvider.getSecret().password,
                };
            },
        );

        const signer: Signer = await createSigner({
            type: WalletTypes.HD,
            secretProvider: secretProviderFromSigner,
        });

        const secretProviderFromAccount: SecretsProvider = new SecretsProvider(
            () => {
                return {
                    rootHDPath: rootHDPath,
                    seed: options.mnemonic,
                };
            },
        );

        const initialAccountId: string = generateRandomId();
        const initialAccount: Account = await Account.create(
            options.accountOptions,
            secretProviderFromAccount,
        );

        const accounts: Map<string, Account> = new Map([
            [initialAccountId, initialAccount],
        ]);

        return new Wallet({
            type: WalletTypes.HD,
            signer,
            accounts,
            activeAccount: initialAccount,
        });
    }

    public static async restore(
        payload: IRestoreWalletPayload,
        passwordProvider: SecretsProvider,
    ): Promise<Wallet> {
        const { signerRecord, accountRecords } = payload;

        const signer: Signer = restoreSigner({
            type: signerRecord.type,
            encryptedData: signerRecord.encryptedData,
        });

        const secretData: IPrivateKeyCredentials | IHDSecret =
            await decryptSignerData(
                signer.getEncryptedSecret(),
                passwordProvider,
            );
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
