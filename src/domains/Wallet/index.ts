import Signer, { ISignerRecord, WalletTypes } from "@domains/Signer";
import { ISigningSessionOptions } from "@domains/SigningSession";
import Account, {
    IAccountRecord,
    TCreateAccountPayload,
    TEditableAccountOptions,
} from "@domains/Account";
import {
    createImportedSigner,
    createSigner,
    restoreSigner,
} from "@fabrics/signer";
import { generateRandomId } from "@utils/index";
import SecretsProvider, {
    IHDSecret,
    IPrivateKeyCredentials,
    TDecryptedSecret,
} from "@domains/SecretsProvider";
import KeysManager from "@services/KeysManager";
import Bip44Path from "@domains/Bip44Path";
import AccountManager, { ICreatedAccountData } from "@services/AccountManager";
import ConcurrentOperationGuardService, {
    OperationScopeMode,
} from "@services/ConcurrentOperationGuard";
import { EnsureAccountIsIdle, OnlyHDWallet } from "@utils/decorators";
import { ITransferDetails, TDeployDetails } from "@services/TransactionService";
import { SignedResult } from "@services/Signer";
import ApiServiceRegistry from "@domains/ApiServiceRegistry";
import ApiClientManager from "@domains/ApiClientManager";
import CryptoService, { EncryptedData } from "@services/Crypto";
import {
    AccountBusyError,
    LastAccountRemovalError,
    UnknownAccountError,
} from "@domains/CustomError";
import ImportKeyfileService from "@services/ImportKeyfileService";

type AddressBrand = { readonly __brand: unique symbol };
export type Address = `1111${string & AddressBrand}`;

export const ACCOUNT_KEY_PREFIX: string = "ACCOUNT";

export interface IWalletOptions {
    id?: string;
    type: WalletTypes;
    signer: Signer;
    accounts: Map<string, Account>;
}

export type TCreateHDPathWalletOptions =
    | {
          customHDPath: Bip44Path;
      }
    | {
          index: number;
      };

export interface ICreateHDWalletOptions {
    pathOptions: TCreateHDPathWalletOptions;
    accountOptions: TCreateAccountPayload;
}

export interface IRestoreWalletPayload {
    signerRecord: ISignerRecord;
    accountRecords: IAccountRecord[];
}

export interface IImportKeyfileWalletPayload {
    walletType: WalletTypes;
    encryptedSecret: EncryptedData;
    accounts: TCreateAccountPayload[];
}

export default class Wallet {
    private readonly id: string;
    private readonly type: WalletTypes;
    private readonly signer: Signer;
    private readonly accountManager: AccountManager;
    private readonly accountOperationsGuard: ConcurrentOperationGuardService<string> =
        new ConcurrentOperationGuardService();

    private constructor({ id, type, signer, accounts }: IWalletOptions) {
        this.id = id ?? generateRandomId();
        this.type = type;
        this.signer = signer;
        this.accountManager = new AccountManager(accounts);
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

    public isUnlocked(): boolean {
        return this.signer.isUnlocked();
    }

    public unlock(
        passwordProvider: SecretsProvider,
        options?: ISigningSessionOptions,
    ): Promise<void> {
        return this.signer.unlock(passwordProvider, options);
    }

    public lock(): void {
        this.signer.lock();
    }

    public isPasswordValid(
        passwordProvider: SecretsProvider,
    ): Promise<boolean> {
        return this.signer.isPasswordValid(passwordProvider);
    }

    public getAccounts(): Account[] {
        return this.accountManager.getAccounts();
    }

    public getAccountsMap(): Map<string, Account> {
        return this.accountManager.getAccountsMap();
    }

    public getAccount(id: string): Account {
        const account: Account | null = this.accountManager.getAccount(id);

        if (!account) {
            throw new UnknownAccountError(this.id, id);
        }

        return account;
    }

    public async runAccountOperation<TResult>(
        accountId: string,
        operation: (account: Account) => Promise<TResult>,
    ): Promise<TResult> {
        const account: Account = this.getAccount(accountId);

        return this.accountOperationsGuard.run(
            new Map(),
            () => new AccountBusyError(this.id, accountId),
            () => operation(account),
            {
                key: accountId,
                mode: OperationScopeMode.SHARED,
                owner: accountId,
            },
        );
    }

    private getDerivationIndex(initialHDPath: Bip44Path): number | null {
        const initialAccountIndex = initialHDPath.getIndex();

        const indexes = this.getAccounts()
            .map((account: Account) => account.getIndex())
            .filter((index: number | null): index is number => index !== null);

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
    ): Promise<ICreatedAccountData> {
        const secretData = (await CryptoService.decryptSignerData(
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

    public addAccounts(accounts: Account[]): void {
        this.accountManager.addAccounts(accounts);
    }

    @OnlyHDWallet
    @EnsureAccountIsIdle
    public removeAccount(id: string): Account {
        if (this.getAccounts().length === 1) {
            throw new LastAccountRemovalError(this.id, id);
        }

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
            id: generateRandomId(),
            type: WalletTypes.PRIVATE_KEY,
            secretProvider,
        });

        const initialAccount: Account = await Account.create(
            accountOptions,
            new SecretsProvider(() => secretProvider.getSecret().secret),
        );

        const accounts: Map<string, Account> = new Map([
            [initialAccount.getId(), initialAccount],
        ]);

        return new Wallet({
            type: WalletTypes.PRIVATE_KEY,
            signer,
            accounts,
        });
    }

    public static async createHD(
        options: ICreateHDWalletOptions,
        secretProvider: SecretsProvider,
    ): Promise<Wallet> {
        const rootHDPath = await KeysManager.getInitialHDPathFromOptions(
            options.pathOptions,
        );

        const secretProviderFromSigner: SecretsProvider = new SecretsProvider(
            () => {
                const { password, secret } = secretProvider.getSecret();

                return {
                    secret: {
                        rootHDPath: rootHDPath.toString(),
                        seed: secret.seed,
                    },
                    password,
                };
            },
        );

        const signer: Signer = await createSigner({
            id: generateRandomId(),
            type: WalletTypes.HD,
            secretProvider: secretProviderFromSigner,
        });

        const secretProviderFromAccount: SecretsProvider = new SecretsProvider(
            () => {
                return {
                    rootHDPath: rootHDPath,
                    seed: secretProvider.getSecret().secret.seed,
                };
            },
        );

        const initialAccount: Account = await Account.create(
            options.accountOptions,
            secretProviderFromAccount,
        );

        const accounts: Map<string, Account> = new Map([
            [initialAccount.getId(), initialAccount],
        ]);

        return new Wallet({
            type: WalletTypes.HD,
            signer,
            accounts,
        });
    }

    public static async importKeyfile(
        { walletType, encryptedSecret, accounts }: IImportKeyfileWalletPayload,
        passwordProvider: SecretsProvider,
    ): Promise<Wallet> {
        const secret: TDecryptedSecret =
            await ImportKeyfileService.decryptKeyfileSecret(
                walletType,
                encryptedSecret,
                passwordProvider,
            );

        const signer: Signer = await createImportedSigner({
            secret,
            passwordProvider,
        });

        const secretProvider: SecretsProvider = new SecretsProvider(
            () => secret,
        );

        const accountsMap: Map<string, Account> = new Map();

        for (const accountOptions of accounts) {
            const account: Account = await Account.create(
                accountOptions,
                secretProvider,
            );

            accountsMap.set(account.getId(), account);
        }

        return new Wallet({
            type: walletType,
            signer,
            accounts: accountsMap,
        });
    }

    public static async restore(
        payload: IRestoreWalletPayload,
        passwordProvider: SecretsProvider,
    ): Promise<Wallet> {
        const { signerRecord, accountRecords } = payload;

        const signer: Signer = restoreSigner(signerRecord);

        const secretData: IPrivateKeyCredentials | IHDSecret =
            await CryptoService.decryptSignerData(
                signer.getEncryptedSecret(),
                passwordProvider,
            );
        const secretProvider = new SecretsProvider(() => secretData);

        const accountsMap: Map<string, Account> = new Map();

        for (const record of accountRecords) {
            const account = await Account.create(
                {
                    id: record.id,
                    name: record.name,
                    index: record.index ?? undefined,
                },
                secretProvider,
            );

            accountsMap.set(account.getId(), account);
        }

        return new Wallet({
            type: signerRecord.type,
            signer,
            accounts: accountsMap,
        });
    }

    public async transfer(
        accountId: string,
        payload: ITransferDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<string> {
        return this.runAccountOperation(accountId, (account: Account) =>
            ApiClientManager.getInstance().runNetworkOperation(() =>
                ApiServiceRegistry.getInstance().transactions.transfer({
                    walletType: this.type,
                    account,
                    signer: this.signer,
                    details: payload,
                    passwordProvider,
                }),
            ),
        );
    }

    public async deploy(
        accountId: string,
        payload: TDeployDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<string> {
        return this.runAccountOperation(accountId, (account: Account) =>
            ApiClientManager.getInstance().runNetworkOperation(() =>
                ApiServiceRegistry.getInstance().transactions.deploy({
                    walletType: this.type,
                    account,
                    signer: this.signer,
                    ...payload,
                    passwordProvider,
                }),
            ),
        );
    }

    public async signDeploy(
        accountId: string,
        payload: TDeployDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<SignedResult> {
        return this.runAccountOperation(accountId, (account: Account) =>
            ApiClientManager.getInstance().runNetworkOperation(() =>
                ApiServiceRegistry.getInstance().transactions.signDeploy({
                    walletType: this.type,
                    account,
                    signer: this.signer,
                    ...payload,
                    passwordProvider,
                }),
            ),
        );
    }

    public async signTransfer(
        accountId: string,
        payload: ITransferDetails,
        passwordProvider?: SecretsProvider,
    ): Promise<SignedResult> {
        return this.runAccountOperation(accountId, (account: Account) =>
            ApiClientManager.getInstance().runNetworkOperation(() =>
                ApiServiceRegistry.getInstance().transactions.signTransfer({
                    walletType: this.type,
                    account,
                    signer: this.signer,
                    details: payload,
                    passwordProvider,
                }),
            ),
        );
    }
}
