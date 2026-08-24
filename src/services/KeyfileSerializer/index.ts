import Account from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";
import Wallet from "@domains/Wallet";
import { WalletTypes } from "@domains/Signer";
import CryptoService, { EncryptedData } from "@services/Crypto";

export interface IKeyfileAccount {
    name: string;
    address: string;
    index: number | null;
}

export interface IKeyfileWalletAccount {
    name: string;
    index: number | null;
}

export interface IKeyfileWallet {
    walletType: WalletTypes;
    encryptedPrivateData: EncryptedData;
    encryptedAccounts: EncryptedData;
}

export default class KeyfileSerializer {
    public static serializeAccount = (account: Account): IKeyfileAccount => {
        return {
            name: account.getName(),
            address: account.getAddress(),
            index: account.getIndex(),
        };
    };

    public static serializeWalletAccount = (
        account: Account,
    ): IKeyfileWalletAccount => {
        return {
            name: account.getName(),
            index: account.getIndex(),
        };
    };

    public static serializeWallet = async (
        wallet: Wallet,
        passwordProvider: SecretsProvider,
    ): Promise<IKeyfileWallet> => {
        const accounts: IKeyfileWalletAccount[] = wallet
            .getAccounts()
            .map(KeyfileSerializer.serializeWalletAccount);

        return {
            walletType: wallet.getType(),
            encryptedPrivateData: wallet.getSigner().getEncryptedSecret(),
            encryptedAccounts: await CryptoService.encryptWithPassword(
                JSON.stringify(accounts),
                passwordProvider.getSecret().password,
            ),
        };
    };
}
