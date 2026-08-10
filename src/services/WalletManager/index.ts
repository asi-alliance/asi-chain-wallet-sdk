import Account from "@domains/Account";
import ItemManager from "@services/ItemManager";
import Wallet, { ACCOUNT_KEY_PREFIX } from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import StorageManager, { IWalletStorageData } from "@services/StorageManager";
import { SIGNER_KEY_PREFIX, WalletTypes } from "@domains/Signer";
import { ISignerStorageRecord } from "@domains/SignersStorageRepository";
import { IAccountStorageRecord } from "@domains/AccountsStorageRepository";
import {
    DuplicateAccountError,
    DuplicateWalletError,
    WalletAction,
    WalletActionInProgressError,
} from "@domains/CustomError";
import ConcurrentOperationGuardService from "@services/ConcurrentOperationGuard";

export interface IAccountMetadata {
    id: string;
    name: string;
    index: number | null;
}

export interface IWalletMetadata {
    signerId: string;
    type: WalletTypes;
    accounts: IAccountMetadata[];
}

export interface ICreateHDWalletParams {
    mnemonic: string;
    accountName: string;
    index?: number;
}

export interface IDerivedAccount {
    accountId: string;
    account: Account;
}

export default class WalletManager extends ItemManager<Wallet> {
    private readonly operationsGuard: ConcurrentOperationGuardService =
        new ConcurrentOperationGuardService();

    public async createHD(
        { mnemonic, accountName, index }: ICreateHDWalletParams,
        passwordProvider: SecretsProvider,
    ): Promise<Wallet> {
        const wallet: Wallet = await Wallet.createHD(
            {
                mnemonic,
                pathOptions: { index: index ?? 0 },
                accountOptions: { name: accountName },
            },
            passwordProvider,
        );

        await this.persist(wallet);

        return wallet;
    }

    public async createPrivateKey(
        accountName: string,
        secretProvider: SecretsProvider,
    ): Promise<Wallet> {
        const wallet: Wallet = await Wallet.createPk(
            { name: accountName },
            secretProvider,
        );

        await this.persist(wallet);

        return wallet;
    }

    public async unlock(
        signerId: string,
        passwordProvider: SecretsProvider,
    ): Promise<Wallet> {
        return this.operationsGuard.run(
            [`${WalletAction.UNLOCK}:${signerId}`],
            signerId,
            () => new WalletActionInProgressError(WalletAction.UNLOCK, signerId),
            async () => {
                const wallet: Wallet = await StorageManager.getWallet({
                    signerId,
                    passwordProvider,
                });

                this.add(wallet.getId(), wallet);

                return wallet;
            },
        );
    }

    public async delete(id: string): Promise<Wallet> {
        const currentWallet: Wallet = super.remove(id);

        const accountIds: string[] = Array.from(
            currentWallet.getAccountsMap().keys(),
        );

        if (accountIds.length) {
            await StorageManager.deleteMultipleAccounts(accountIds);
        }

        await StorageManager.deleteSigner(currentWallet.getSigner().getId());

        return currentWallet;
    }

    public async deriveAccount(
        walletId: string,
        accountName: string,
        passwordProvider: SecretsProvider,
    ): Promise<IDerivedAccount> {
        const wallet: Wallet | null = this.get(walletId);

        if (!wallet) {
            throw new Error("WalletManager.deriveAccount: unknown wallet id");
        }

        const signerId: string = wallet.getSigner().getId();

        return this.operationsGuard.run(
            [`${WalletAction.DERIVE_ACCOUNT}:${signerId}`],
            signerId,
            () =>
                new WalletActionInProgressError(
                    WalletAction.DERIVE_ACCOUNT,
                    signerId,
                ),
            async () => {
                const { account, accountId } = await wallet.deriveAccount(
                    { name: accountName },
                    passwordProvider,
                );

                await StorageManager.saveAccount({
                    id: accountId,
                    account,
                    signerId,
                });

                return { accountId, account };
            },
        );
    }

    public async removeAccount(
        walletId: string,
        accountId: string,
    ): Promise<Account> {
        const currentWallet: Wallet | null = this.get(walletId);

        if (!currentWallet) {
            throw new Error("WalletManager.removeAccount: unknown wallet id");
        }

        const removedAccount: Account = currentWallet.removeAccount(accountId);

        await StorageManager.deleteAccount(accountId);

        return removedAccount;
    }

    public async renameAccount(
        walletId: string,
        accountId: string,
        name: string,
    ): Promise<void> {
        const currentWallet: Wallet | null = this.get(walletId);

        if (!currentWallet) {
            throw new Error("WalletManager.renameAccount: unknown wallet id");
        }

        currentWallet.updateAccount(accountId, { name });

        await StorageManager.updateAccount(accountId, { name });
    }

    public getAccount(walletId: string, accountId: string): Account {
        const currentWallet: Wallet | null = this.get(walletId);

        if (!currentWallet) {
            throw new Error("WalletManager.getAccount: unknown wallet id");
        }

        const currentAccount: Account | undefined = currentWallet
            .getAccounts()
            .find((account: Account) => account.getId() === accountId);

        if (!currentAccount) {
            throw new Error("WalletManager.getAccount: unknown account id");
        }

        return currentAccount;
    }

    public setActiveAccount(walletId: string, accountId: string): void {
        const currentWallet: Wallet | null = this.get(walletId);

        if (!currentWallet) {
            throw new Error(
                "WalletManager.setActiveAccount: unknown wallet id",
            );
        }

        currentWallet.setActiveAccount(accountId);
    }

    public async getPublicWalletsMetadata(): Promise<IWalletMetadata[]> {
        const walletsData: IWalletStorageData[] =
            await StorageManager.getWallets();

        return walletsData.map(({ signer, accounts }: IWalletStorageData) => ({
            signerId: signer.id,
            type: signer.type,
            accounts: accounts.map((account) => ({
                id: account.id,
                name: account.name,
                index: account.index,
            })),
        }));
    }

    public async count(): Promise<number> {
        return this.items.size;
    }

    public async countInStorage(): Promise<number> {
        return (await StorageManager.getSigners()).length;
    }

    private async assertWalletIsNotDuplicate(wallet: Wallet): Promise<void> {
        const existingSigner: ISignerStorageRecord | null =
            await StorageManager.findSignerByFingerprint(
                wallet.getSigner().getFingerprint(),
            );

        if (existingSigner) {
            throw new DuplicateWalletError(existingSigner.id);
        }

        for (const account of wallet.getAccounts()) {
            const existingAccount: IAccountStorageRecord | null =
                await StorageManager.findAccountByFingerprint(
                    account.getFingerprint(),
                );

            if (existingAccount) {
                throw new DuplicateAccountError(
                    existingAccount.signerId,
                    existingAccount.id,
                );
            }
        }
    }

    private getFingerprintKeys(wallet: Wallet): string[] {
        const accountKeys: string[] = wallet
            .getAccounts()
            .map(
                (account: Account) =>
                    `${ACCOUNT_KEY_PREFIX}:${account.getFingerprint()}`,
            );

        return [
            `${SIGNER_KEY_PREFIX}:${wallet.getSigner().getFingerprint()}`,
            ...accountKeys,
        ];
    }

    private async persist(wallet: Wallet): Promise<void> {
        const signerId: string = wallet.getSigner().getId();

        return this.operationsGuard.run(
            this.getFingerprintKeys(wallet),
            signerId,
            (conflictSignerId: string) =>
                new DuplicateWalletError(conflictSignerId),
            async () => {
                await this.assertWalletIsNotDuplicate(wallet);

                await StorageManager.saveWallet({ signerId, wallet });

                this.add(wallet.getId(), wallet);
            },
        );
    }
}
