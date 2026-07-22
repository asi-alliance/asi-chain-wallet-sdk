import Account from "@domains/Account";
import ItemManager from "@services/ItemManager";
import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import StorageManager, { IWalletStorageData } from "@services/StorageManager";
import { WalletTypes } from "@domains/Signer";

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
        const wallet: Wallet = await StorageManager.getWallet({
            signerId,
            passwordProvider,
        });

        this.add(wallet.getId(), wallet);

        return wallet;
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

        const { account, accountId } = await wallet.deriveAccount(
            { name: accountName },
            passwordProvider,
        );

        await StorageManager.saveAccount({ id: accountId, account, signerId });

        return { accountId, account };
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

    private async persist(wallet: Wallet): Promise<void> {
        await StorageManager.saveWallet({
            signerId: wallet.getSigner().getId(),
            wallet,
        });

        this.add(wallet.getId(), wallet);
    }
}
