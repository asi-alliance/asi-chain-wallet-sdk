import { BlockchainGateway, WebVault, Client, WebAuxiliaryVault, WebFileSaver, NetworkType } from "asi-wallet-sdk";

type NetworkConfig = {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
};

const init = async (config: NetworkConfig, networkType: NetworkType = NetworkType.DEVNET) => {
    const sdkClient = await Client.create({
        vault: new WebVault(),
        auxilliaryVault: new WebAuxiliaryVault(),
        fileSaver: new WebFileSaver(),
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
        },
        networkType
    });

    return sdkClient;
};

export type { NetworkConfig };
export { init };
