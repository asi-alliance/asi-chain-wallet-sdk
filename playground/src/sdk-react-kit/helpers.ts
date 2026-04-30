import { AssetsService, BlockchainGateway, WebVault, Client, WebAuxiliaryVault } from "asi-wallet-sdk";

type NetworkConfig = {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
};

const init = async (config: NetworkConfig) => {
    const sdkClient = await Client.create({
        vault: new WebVault(),
        auxilliaryVault: new WebAuxiliaryVault()
    });

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

    return sdkClient;
};

export type { NetworkConfig };
export { init };
