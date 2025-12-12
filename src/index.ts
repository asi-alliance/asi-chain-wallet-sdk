import WalletClient from "./client";
import RChainService from "./services/chainService";
import SecureWebWalletsStorage from "./domains/SecureStorage";

import { AccountManager } from "./services/accountsManager";
import type { WalletData } from "./domains/SecureStorage";

export type { WalletData };

export { SecureWebWalletsStorage, AccountManager, RChainService };

export default WalletClient;
