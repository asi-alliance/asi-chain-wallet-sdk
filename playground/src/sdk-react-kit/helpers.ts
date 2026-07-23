import { Client, IClientEventDispatcher } from "asi-wallet-sdk";
import { DEFAULT_NETWORK, NETWORKS_CONFIG } from "./networksConfig";
import { SDK_CLIENT_SESSION_AUTO_LOCK_MS } from "@utils/constants";

const init = async (
    eventDispatcher: IClientEventDispatcher,
): Promise<Client> => {
    return Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: DEFAULT_NETWORK,
        eventDispatcher,
        security: {
            autoLockMs: SDK_CLIENT_SESSION_AUTO_LOCK_MS,
        },
    });
};

export { init };
