import { PasswordProvider } from "./../../domains/Signer/index";
import BrowserStorage from "@domains/BrowserStorage";
import EncryptedRecord from "@domains/EncryptedRecord";
import { IDBStorageController } from "@domains/IDBStorageController";
import { TPasswordProvider } from "@domains/PasswordProvider";
import Seed from "@domains/Seed";
import CryptoService from "@services/Crypto";
import KeyDerivationService from "@services/KeyDerivation";
import { ASI_COIN_TYPE } from "@utils/constants";

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
}

export default StoreManager;
