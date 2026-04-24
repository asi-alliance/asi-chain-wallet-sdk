import { AssetsService, BlockchainGateway, Vault } from "asi-wallet-sdk";

type NetworkConfig = {
    ValidatorURL: string;
    ReadOnlyURL: string;
};

const getVaultStorageDataKey = (vaultStorageKey: string) =>
    `ASI_WALLETS_VAULT_${vaultStorageKey}`;

const init = (config: NetworkConfig, vaultStorageKey: string) => {
    BlockchainGateway.init({
        validator: {
            baseUrl: config.ValidatorURL,
            axiosConfig: {},
        },
        indexer: {
            baseUrl: config.ReadOnlyURL,
            axiosConfig: {},
        },
    });

    const assetsService = new AssetsService();
    const encryptedVaultData = Vault.getVaultDataFromStorage(
        getVaultStorageDataKey(vaultStorageKey),
    );
    const vault = new Vault(encryptedVaultData);

    return { assetsService, vault };
};

const resetApp = () => {
    Vault.clearSavedVaults();
};

export type { NetworkConfig };
export { init, resetApp };
