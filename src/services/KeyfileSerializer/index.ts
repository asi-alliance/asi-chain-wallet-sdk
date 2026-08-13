import Account from "@domains/Account";
import Wallet from "@domains/Wallet";
import { WalletTypes } from "@domains/Signer";
import { EncryptedData } from "@services/Crypto";

export interface IKeyfileAccount {
    name: string;
    address: string;
    index: number | null;
}

export interface IKeyfileWallet {
    walletType: WalletTypes;
    encryptedPrivateData: EncryptedData;
    accounts: IKeyfileAccount[];
}

export default class KeyfileSerializer {
    public static serializeAccount = (account: Account): IKeyfileAccount => {
        return {
            name: account.getName(),
            address: account.getAddress(),
            index: account.getIndex(),
        };
    };

    public static serializeWallet = (wallet: Wallet): IKeyfileWallet => {
        return {
            walletType: wallet.getType(),
            encryptedPrivateData: wallet.getSigner().getEncryptedSecret(),
            accounts: wallet
                .getAccounts()
                .map(KeyfileSerializer.serializeAccount),
        };
    };
}