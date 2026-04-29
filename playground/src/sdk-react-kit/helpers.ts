import { AssetsService, BlockchainGateway, Vault } from "asi-wallet-sdk";

type NetworkConfig = {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
};

const init = (config: NetworkConfig) => {
    BlockchainGateway.init({
        validator: {
            baseUrl: config.ValidatorURL,
            axiosConfig: {},
        },
        indexer: {
            baseUrl: config.ReadOnlyURL,
            axiosConfig: {},
        },
        graphql: {
            baseUrl: config.IndexerURL,
            axiosConfig: {},
        }
    });

    const assetsService = new AssetsService();
    const vault = new Vault();

    return { assetsService, vault };
};

export type { NetworkConfig };
export { init };
