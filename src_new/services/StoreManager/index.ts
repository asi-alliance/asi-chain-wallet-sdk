import {
    IFullWalletRecord,
    IWalletEncryptedFields,
    WalletsStorageController,
    WalletTypes,
} from "@domains/WalletsStorageController";
import {
    TPasswordProvider,
    TPrivateKeyPasswordProvider,
} from "@domains/PasswordProvider";
import Wallet from "@domains/Wallet";
import CryptoService from "@services/Crypto";
import { stringifyPrivateKeyToUnitArray } from "@utils/index";
import { isPrivateKeyPasswordData } from "@utils/guards";

export interface ISeedStoreData {
    mnemonic: string;
    HDPath: string;
    depth: number;
}

export interface IWalletStoredData {
    name: string;
    privateKey: string;
}

export interface IHDWalletData {
    seed: Uint8Array;
    index: number;
    path: string;
}

class StoreManager {
    public static saveWallet = async (
        id: string,
        name: string,
        passwordProvider: TPasswordProvider | TPrivateKeyPasswordProvider,
        hdWalletData?: IHDWalletData,
    ) => {
        const passwordData = await passwordProvider();

        if (hdWalletData) {
            const encryptedData = await CryptoService.encryptWithPassword(
                JSON.stringify({
                    keyData: hdWalletData.seed,
                    depth: hdWalletData.index,
                    HDPath: hdWalletData.path,
                }),
                passwordData.password,
            );

            await WalletsStorageController.getInstance().saveWallet(
                id,
                name,
                WalletTypes.HD,
                encryptedData,
            );
        }

        if (!isPrivateKeyPasswordData(passwordData)) {
            throw new Error("You cannot create PK wallet without privateKey");
        }

        const { password, privateKey } = passwordData;

        const encryptedData = await CryptoService.encryptWithPassword(
            JSON.stringify({
                name,
                keyData: privateKey,
                depth: null,
                HDPath: null,
            }),
            password,
        );

        await WalletsStorageController.getInstance().saveWallet(
            id,
            name,
            WalletTypes.PRIVATE_KEY,
            encryptedData,
        );

        return;
    };

    public static getWallet = async (
        //TODO: Save id in Wallet entity, give in constructor
        id: string,
        passwordProvider: TPasswordProvider,
    ): Promise<Wallet> => {
        const { password } = await passwordProvider();

        const walletRecord: IFullWalletRecord | null =
            await WalletsStorageController.getInstance().getWallet(id);

        if (!walletRecord) {
            throw new Error("Wallet with this id not found");
        }

        const walletDataInString: string =
            await CryptoService.decryptWithPassword(
                walletRecord.encryptedData,
                password,
            );
        const walletData = JSON.parse(
            walletDataInString,
        ) as IWalletEncryptedFields;

        const keyData: Uint8Array = stringifyPrivateKeyToUnitArray(
            walletData.keyData,
        );

        if (walletRecord.type === WalletTypes.PRIVATE_KEY) {
            const passwordProvider: TPrivateKeyPasswordProvider = async () => {
                return { privateKey: keyData, password };
            };

            return Wallet.fromPrivateKey(walletRecord.name, passwordProvider);
        }

        const { wallet } = await Wallet.fromSeed(
            keyData,
            walletRecord.name,
            passwordProvider,
            walletData.depth!,
            walletData.HDPath,
        );

        return wallet;
    };
}

export default StoreManager;
