import {
    IFullWalletRecord,
    IPublicWalletRecord,
    IWalletRecordEncryptedFields,
    WalletsStorageRepository,
    WalletTypes,
} from "@domains/WalletsStorageRepository";
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

            await WalletsStorageRepository.getInstance().saveWallet(
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
                keyData: privateKey,
                depth: null,
                HDPath: null,
            }),
            password,
        );

        await WalletsStorageRepository.getInstance().saveWallet(
            id,
            name,
            WalletTypes.PRIVATE_KEY,
            encryptedData,
        );

        return;
    };

    public static saveWallets = async (wallets: Wallet[]): Promise<void> => {
        wallets.forEach(async (wallet: Wallet) => {
            await WalletsStorageRepository.getInstance().saveWallet(
                wallet.getId(),
                wallet.getName(),
                wallet.getType(),
                wallet.getEncryptedPrivateData(),
            );
        });
    };

    public static getWallet = async (
        id: string,
        passwordProvider: TPasswordProvider,
    ): Promise<Wallet> => {
        const { password } = await passwordProvider();

        const walletRecord: IFullWalletRecord | null =
            await WalletsStorageRepository.getInstance().getWallet(id);

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
        ) as IWalletRecordEncryptedFields;

        const keyData: Uint8Array = stringifyPrivateKeyToUnitArray(
            walletData.keyData,
        );

        if (walletRecord.type === WalletTypes.PRIVATE_KEY) {
            const passwordProvider: TPrivateKeyPasswordProvider = async () => {
                return { privateKey: keyData, password };
            };

            return Wallet.fromPrivateKey(
                walletRecord.name,
                passwordProvider,
                id,
            );
        }

        const { wallet } = await Wallet.fromSeed({
            id,
            seed: keyData,
            name: walletRecord.name,
            passwordProvider,
            index: walletData.depth!,
            customHDPath: walletData.HDPath,
        });

        return wallet;
    };

    public static getWallets = async (): Promise<IPublicWalletRecord[]> => {
        const walletRecords: IFullWalletRecord[] =
            await WalletsStorageRepository.getInstance().getAllWallets();

        return walletRecords.map((fullWalletRecord: IFullWalletRecord) => ({
            id: fullWalletRecord.id,
            name: fullWalletRecord.name,
            type: fullWalletRecord.type,
        }));
    };
}

export default StoreManager;
