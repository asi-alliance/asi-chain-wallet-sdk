import { Client, IClientEventDispatcher } from "asi-wallet-sdk";
import { DEFAULT_NETWORK, NETWORKS_CONFIG } from "./networksConfig";

const init = async (
    eventDispatcher: IClientEventDispatcher,
): Promise<Client> => {
    return Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: DEFAULT_NETWORK,
        eventDispatcher,
    });
};

export { init };
