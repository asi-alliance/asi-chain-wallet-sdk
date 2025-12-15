import WalletSDK from "./core";
import MnemonicService from "./services/mnemonic";
import RChainService from "./services/chainService";
import SecureWebWalletsStorage from "./domains/SecureStorage";
import { WalletsService } from "./services/accountsManager";
import type { WalletData } from "./domains/SecureStorage";

export type { WalletData };

export {
    RChainService,
    WalletsService,
    MnemonicService,
    SecureWebWalletsStorage,
};

export default WalletSDK;
