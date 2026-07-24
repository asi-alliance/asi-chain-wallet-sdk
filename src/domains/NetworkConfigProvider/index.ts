import {
    INetworkConfig,
    INetworkRecord,
    INetworkUpdate,
    NetworkId,
    NetworkName,
    TNetworksConfig,
} from "@domains/Network";
import { generateRandomId, validateUrl } from "@utils/index";
import {
    EnsureNetworkConfigProviderReady,
    EnsureNetworkExist,
    EnsureNetworkNotDefault,
} from "@utils/decorators/networkConfigProvider";

export default class NetworkConfigProvider {
    private networksRecords: Map<NetworkId, INetworkRecord> | null = null;

    private validateConfigUrls(
        config: Partial<INetworkConfig>,
        { allowEmpty }: { allowEmpty: boolean },
    ): void {
        (Object.entries(config) as [keyof INetworkConfig, string][]).forEach(
            ([field, url]) => {
                if (allowEmpty && (url ?? "").trim().length === 0) {
                    return;
                }

                const { isValid, error } = validateUrl(url);

                if (!isValid) {
                    throw new Error(`Invalid ${field}: ${error}`);
                }
            },
        );
    }

    public initialize(config: TNetworksConfig): void {
        Object.values(config).forEach((networkConfig: INetworkConfig) => {
            this.validateConfigUrls(networkConfig, { allowEmpty: true });
        });

        this.networksRecords = new Map<NetworkId, INetworkRecord>(
            Object.entries(config).map(([name, networkConfig]) => [
                name,
                {
                    id: name,
                    name,
                    config: networkConfig,
                    isDefault: true,
                },
            ]),
        );
    }

    @EnsureNetworkConfigProviderReady
    public restoreCustomNetworks(records: INetworkRecord[]): void {
        records.forEach((record: INetworkRecord) => {
            this.networksRecords!.set(record.id, {
                ...record,
                isDefault: false,
            });
        });
    }

    @EnsureNetworkConfigProviderReady
    public getAll(): INetworkRecord[] {
        return Array.from(this.networksRecords!.values());
    }

    @EnsureNetworkConfigProviderReady
    @EnsureNetworkExist
    public get(id: NetworkId): INetworkRecord {
        return this.networksRecords!.get(id)!;
    }

    @EnsureNetworkConfigProviderReady
    public getIds(): NetworkId[] {
        return Array.from(this.networksRecords!.keys());
    }

    @EnsureNetworkConfigProviderReady
    public add(
        name: NetworkName,
        networkConfig: INetworkConfig,
    ): INetworkRecord {
        this.validateConfigUrls(networkConfig, { allowEmpty: false });

        const record: INetworkRecord = {
            id: generateRandomId(),
            name,
            config: networkConfig,
            isDefault: false,
        };

        this.networksRecords!.set(record.id, record);

        return record;
    }

    @EnsureNetworkConfigProviderReady
    @EnsureNetworkExist
    @EnsureNetworkNotDefault
    public remove(id: NetworkId): INetworkRecord {
        const record: INetworkRecord = this.networksRecords!.get(id)!;

        this.networksRecords!.delete(id);

        return record;
    }

    @EnsureNetworkConfigProviderReady
    @EnsureNetworkExist
    @EnsureNetworkNotDefault
    public update(id: NetworkId, update: INetworkUpdate): void {
        if (update.config) {
            this.validateConfigUrls(update.config, { allowEmpty: false });
        }

        const record: INetworkRecord = this.networksRecords!.get(id)!;

        if (update.name !== undefined) {
            record.name = update.name;
        }

        if (update.config) {
            record.config = { ...record.config, ...update.config };
        }
    }

    public isReady(): boolean {
        return this.networksRecords !== null;
    }
}
