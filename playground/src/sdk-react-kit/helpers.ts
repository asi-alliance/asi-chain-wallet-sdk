import { Client, TClientEventName } from "asi-wallet-sdk";
import { DEFAULT_NETWORK, NETWORKS_CONFIG } from "./networksConfig";
import { SDK_CLIENT_SESSION_AUTO_LOCK_MS } from "@utils/constants";

const init = async (): Promise<Client> => {
    return Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: DEFAULT_NETWORK,
        onListenerError: (name: TClientEventName, error: unknown) => {
            console.error(`SDK event listener failed: ${name}`, error);
        },
        security: {
            autoLockMs: SDK_CLIENT_SESSION_AUTO_LOCK_MS,
        },
    });
};

export { init };
