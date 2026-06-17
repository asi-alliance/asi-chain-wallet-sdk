import {
    IDBStorageController,
    ISeedRecord,
} from "@domains/IDBStorageController";
import {
    THDWalletPasswordProvider,
    TPasswordProvider,
    TPrivateKeyPasswordProvider,
} from "@domains/PasswordProvider";
import CryptoService from "@services/Crypto";
import KeyDerivationService from "@services/KeyDerivation";
import { ASI_COIN_TYPE } from "@utils/constants";
import { isHDWalletPasswordData } from "@utils/guards";

export interface ISeedStoreData {
    mnemonic: string;
    HDPath: string;
    depth: number;
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

        IDBStorageController.getInstance().saveSeed(id, encryptedData);
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

        IDBStorageController.getInstance().updateSeed(id, encryptedData);
    };

    private static increaseSeedDepth = async (
        seedId: string,
        passwordProvider: THDWalletPasswordProvider,
    ): Promise<void> => {
        const { seedPassword } = await passwordProvider();

        const seedRecord: ISeedRecord | null =
            await IDBStorageController.getInstance().getSeed(seedId);

        if (!seedRecord) {
            throw new Error("You cannot create HD wallet for undefined seed");
        }

        const seedDataInString: string =
            await CryptoService.decryptWithPassword(
                seedRecord.encryptedData,
                seedPassword,
            );

        const seedData: ISeedStoreData = JSON.parse(seedDataInString);

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

        IDBStorageController.getInstance().saveWallet(
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
}

export default StoreManager;
