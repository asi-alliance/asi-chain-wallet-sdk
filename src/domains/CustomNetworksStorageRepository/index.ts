import { INetworkConfig, NetworkId, NetworkName } from "@domains/Network";
import { ITableRecord } from "@domains/TableService";
import { IStorageFabricOptions } from "@utils/fabrics/storage";
import { BaseStorageRepository } from "@domains/BaseStorageRepository";

const CUSTOM_NETWORKS_DATA_KEY: string = "CUSTOM_NETWORKS";

export interface ICustomNetworkStorageRecord extends ITableRecord {
    name: NetworkName;
    config: INetworkConfig;

    createdAt: number;
    updatedAt?: number;
}

export class CustomNetworksStorageRepository extends BaseStorageRepository<ICustomNetworkStorageRecord> {
    private static instance: CustomNetworksStorageRepository;

    public constructor(options?: IStorageFabricOptions) {
        super(CUSTOM_NETWORKS_DATA_KEY, options);
    }

    public static getInstance(
        options?: IStorageFabricOptions,
    ): CustomNetworksStorageRepository {
        if (!CustomNetworksStorageRepository.instance) {
            CustomNetworksStorageRepository.instance =
                new CustomNetworksStorageRepository(options);
        }
        return CustomNetworksStorageRepository.instance;
    }

    public async saveCustomNetwork(
        id: NetworkId,
        name: NetworkName,
        config: INetworkConfig,
    ): Promise<void> {
        await this.insertRecord({
            id,
            name,
            config,
            createdAt: Date.now(),
        });
    }

    public async getAllCustomNetworks(): Promise<
        ICustomNetworkStorageRecord[]
    > {
        return this.getAllRecords();
    }

    public async updateCustomNetwork(
        id: NetworkId,
        updates: Partial<ICustomNetworkStorageRecord>,
    ): Promise<void> {
        await this.updateRecord(id, updates);
    }

    public async deleteCustomNetwork(id: NetworkId): Promise<void> {
        await this.deleteRecord(id);
    }
}

export { CUSTOM_NETWORKS_DATA_KEY };
