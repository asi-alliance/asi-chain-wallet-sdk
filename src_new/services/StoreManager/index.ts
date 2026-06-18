import {
    WalletsStorageController,
    ISeedRecord,
    IWalletRecord,
} from "@domains/WalletsStorageController";
import {
    THDWalletPasswordProvider,
    TPasswordProvider,
    TPrivateKeyPasswordProvider,
} from "@domains/PasswordProvider";
import Wallet from "@domains/Wallet";
import CryptoService from "@services/Crypto";
import KeyDerivationService from "@services/KeyDerivation";
import { stringifyPrivateKeyToUnitArray } from "@utils";
import { ASI_COIN_TYPE } from "@utils/constants";
import { isHDWalletPasswordData } from "@utils/guards";
import { TPasswordProviderWithPrivateKey } from "../../../dist/domains/PasswordProvider";

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
    seedId: string;
    index: number;
    seedPasswordProvider: TPasswordProvider;
}

class StoreManager {
    public static saveSeed = async (
        id: string,
        mnemonic: string,
        passwordProvider: TPasswordProvider,
        customHDPath?: string,
    ): Promise<void> => {
        const { password } = await passwordProvider();

        const HDPath =
            customHDPath ??
            KeyDerivationService.buildBip44Path({
                coinType: ASI_COIN_TYPE,
                account: 0,
                change: 0,
                index: 0,
            });

        const encryptedData = await CryptoService.encryptWithPassword(
            JSON.stringify({
                mnemonic,
                HDPath,
                depth: 0,
            }),
            password,
        );

        WalletsStorageController.getInstance().saveSeed(id, encryptedData);
    };

    public static getSeed = async (
        seedId: string,
        passwordProvider: TPasswordProvider,
    ): Promise<ISeedStoreData> => {
        const { password } = await passwordProvider();

        const seedRecord: ISeedRecord | null =
            await WalletsStorageController.getInstance().getSeed(seedId);

        if (!seedRecord) {
            throw new Error("You cannot create HD wallet for undefined seed");
        }

        const seedDataInString: string =
            await CryptoService.decryptWithPassword(
                seedRecord.encryptedData,
                password,
            );

        return JSON.parse(seedDataInString) as ISeedStoreData;
    };

    private static updateSeed = async (
        id: string,
        seedStoreData: ISeedStoreData,
        passwordProvider: THDWalletPasswordProvider,
    ) => {
        const { seedPassword } = await passwordProvider();

        const encryptedData = await CryptoService.encryptWithPassword(
            JSON.stringify(seedStoreData),
            seedPassword,
        );

        WalletsStorageController.getInstance().updateSeed(id, encryptedData);
    };

    private static increaseSeedDepth = async (
        seedId: string,
        passwordProvider: THDWalletPasswordProvider,
    ): Promise<void> => {
        const seedData: ISeedStoreData = await StoreManager.getSeed(
            seedId,
            passwordProvider,
        );

        seedData.depth++;

        await StoreManager.updateSeed(seedId, seedData, passwordProvider);
    };

    public static saveWallet = async (
        id: string,
        name: string,
        passwordProvider:
            | THDWalletPasswordProvider
            | TPrivateKeyPasswordProvider,
        networkId: string,
        seedId?: string,
    ) => {
        const passwordData = await passwordProvider();

        const { password, privateKey } = passwordData;

        const encryptedData = await CryptoService.encryptWithPassword(
            JSON.stringify({
                name,
                privateKey,
            }),
            password,
        );

        WalletsStorageController.getInstance().saveWallet(
            id,
            encryptedData,
            networkId,
        );

        if (!isHDWalletPasswordData(passwordData)) {
            return;
        }

        if (!seedId) {
            throw new Error("You want create HD wallet without seed id");
        }

        await this.increaseSeedDepth(
            seedId,
            passwordProvider as THDWalletPasswordProvider,
        );
    };

    public static getPKWallet = async (
        id: string,
        passwordProvider: TPasswordProvider,
    ): Promise<Wallet> => {
        const { password } = await passwordProvider();

        const walletRecord: IWalletRecord | null =
            await WalletsStorageController.getInstance().getWallet(id);

        if (!walletRecord) {
            throw new Error("Wallet with this id not found");
        }

        const walletDataInString: string =
            await CryptoService.decryptWithPassword(
                walletRecord.encryptedData,
                password,
            );

        const { name, privateKey: stringifyPrivateKey } = JSON.parse(
            walletDataInString,
        ) as IWalletStoredData;

        const privateKey: Uint8Array =
            stringifyPrivateKeyToUnitArray(stringifyPrivateKey);

        const updatedPKPasswordProvider: TPasswordProviderWithPrivateKey =
            async () => {
                return {
                    password,
                    privateKey,
                };
            };

        return Wallet.fromPrivateKey(name, updatedPKPasswordProvider);
    };

    public static getHDWallet = async (
        id: string,
        passwordProvider: TPasswordProvider,
        hdWalletData: IHDWalletData,
    ): Promise<Wallet> => {
        const { password } = await passwordProvider();

        const walletRecord: IWalletRecord | null =
            await WalletsStorageController.getInstance().getWallet(id);

        if (!walletRecord) {
            throw new Error("Wallet with this id not found");
        }

        const walletDataInString: string =
            await CryptoService.decryptWithPassword(
                walletRecord.encryptedData,
                password,
            );

        const { name } = JSON.parse(walletDataInString) as IWalletStoredData;

        const seedStoredData: ISeedStoreData = await StoreManager.getSeed(
            hdWalletData.seedId,
            hdWalletData.seedPasswordProvider,
        );

        return Wallet.fromHD(
            hdWalletData.seedId,
            seedStoredData.mnemonic,
            name,
            passwordProvider,
            hdWalletData.index,
        );
    };

    public static getWallet = async (
        id: string,
        passwordProvider: TPasswordProvider,
        hdWalletData?: IHDWalletData,
    ): Promise<Wallet> => {
        if (!hdWalletData) {
            return StoreManager.getPKWallet(id, passwordProvider);
        }

        return StoreManager.getHDWallet(id, passwordProvider, hdWalletData);
    };
}

export default StoreManager;
