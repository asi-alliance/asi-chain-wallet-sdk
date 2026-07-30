import ApiClientManager from "@domains/ApiClientManager";
import StorageManager from "@services/StorageManager";
import {
    INetworkConfig,
    INetworkRecord,
    INetworkUpdate,
    IPersistedNetworkRecord,
    NetworkId,
    NetworkName,
    TNetworksConfig,
} from "@domains/Network";

class NetworkManager {
    public static initialize = async (
        networksConfig: TNetworksConfig,
        defaultNetwork?: NetworkName,
    ): Promise<void> => {
        const customNetworks: IPersistedNetworkRecord[] =
            await StorageManager.getCustomNetworks();

        ApiClientManager.getInstance().initialize(
            networksConfig,
            customNetworks,
            defaultNetwork,
        );
    };

    public static addNetwork = async (
        name: NetworkName,
        config: INetworkConfig,
    ): Promise<INetworkRecord> => {
        const record: INetworkRecord = ApiClientManager.getInstance().addNetwork(
            name,
            config,
        );

        await StorageManager.saveCustomNetwork(record);

        return record;
    };

    public static updateNetwork = async (
        id: NetworkId,
        update: INetworkUpdate,
    ): Promise<void> => {
        const apiClientManager: ApiClientManager =
            ApiClientManager.getInstance();

        apiClientManager.updateNetwork(id, update);

        await StorageManager.updateCustomNetwork(apiClientManager.getNetwork(id));
    };

    public static removeNetwork = async (id: NetworkId): Promise<void> => {
        ApiClientManager.getInstance().removeNetwork(id);

        await StorageManager.deleteCustomNetwork(id);
    };
}

export default NetworkManager;
