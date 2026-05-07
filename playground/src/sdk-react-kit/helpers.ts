import { WebVault, Client, WebAuxiliaryVault, WebFileSaver } from "asi-wallet-sdk";

type NetworkConfig = {
    ValidatorURL: string;
    ReadOnlyURL: string;
    IndexerURL: string;
};

const init = async (config: NetworkConfig) => {
    const sdkClient = await Client.create({
        vault: new WebVault(),
        auxilliaryVault: new WebAuxiliaryVault(),
        fileSaver: new WebFileSaver(),
    });

    return sdkClient;
};

export type { NetworkConfig };
export { init };
