import { WebVault, Client, WebAuxiliaryVault, WebFileSaver } from "asi-wallet-sdk";

const init = async () => {
    const sdkClient = await Client.create({
        vault: new WebVault(),
        auxilliaryVault: new WebAuxiliaryVault(),
        fileSaver: new WebFileSaver(),
    });

    return sdkClient;
};

export { init };
