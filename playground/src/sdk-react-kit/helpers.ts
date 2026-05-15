import { WebVault, Client, WebAuxiliaryVault, WebFileSaver, IUiEventDispatcher } from "asi-wallet-sdk";

const init = async (uiEventDispatcher: IUiEventDispatcher) => {
    const sdkClient = await Client.create({
        vault: new WebVault(),
        auxilliaryVault: new WebAuxiliaryVault(),
        fileSaver: new WebFileSaver(),
        uiEventDispatcher,
    });

    return sdkClient;
};

export { init };
