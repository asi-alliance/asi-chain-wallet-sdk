import ApiClientManager from "@domains/ApiClientManager";
import StorageManager from "@services/StorageManager";
import {
    createNetworkRecord,
    createUpdatedNetworkRecord,
} from "@fabrics/network";
import { EnsureNetworkIsIdle } from "@utils/decorators/networkManager";
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
    public static async initialize(
        networksConfig: TNetworksConfig,
        defaultNetwork?: NetworkName,
    ): Promise<void> {
        const customNetworks: IPersistedNetworkRecord[] =
            await StorageManager.getCustomNetworks();

        ApiClientManager.getInstance().initialize(
            networksConfig,
            customNetworks,
            defaultNetwork,
        );
    }

    public static async addNetwork(
        name: NetworkName,
        config: INetworkConfig,
    ): Promise<INetworkRecord> {
        const record: INetworkRecord = createNetworkRecord({ name, config });

        await StorageManager.saveCustomNetwork(record);

        ApiClientManager.getInstance().applyNetwork(record);

        return record;
    }

    @EnsureNetworkIsIdle
    public static async updateNetwork(
        id: NetworkId,
        update: INetworkUpdate,
    ): Promise<void> {
        const apiClientManager: ApiClientManager =
            ApiClientManager.getInstance();

        const record: INetworkRecord = createUpdatedNetworkRecord({
            record: apiClientManager.getNetwork(id),
            update,
        });

        await StorageManager.updateCustomNetwork(record);

        apiClientManager.applyNetwork(record);
    }

    @EnsureNetworkIsIdle
    public static async removeNetwork(id: NetworkId): Promise<void> {
        await StorageManager.deleteCustomNetwork(id);

        ApiClientManager.getInstance().removeNetwork(id);
    }
}

export default NetworkManager;
