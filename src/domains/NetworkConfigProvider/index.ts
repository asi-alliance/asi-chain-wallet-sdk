import {
    INetworkConfig,
    INetworkEndpoints,
    INetworkRecord,
    INetworkUpdate,
    IPersistedNetworkRecord,
    NETWORK_URL_FIELDS,
    NetworkId,
    NetworkName,
    TNetworksConfig,
} from "@domains/Network";
import {
    ensureValid,
    generateRandomId,
    validateNetworkUniqueness,
    validateNodeApiProfile,
    validateUrl,
} from "@utils/index";
import { isNodeApiProfile } from "@utils/guards";
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
        NETWORK_URL_FIELDS.forEach((field: keyof INetworkEndpoints) => {
            const url: string | undefined = config[field];

            if (url === undefined) {
                return;
            }

            if (allowEmpty && url.trim().length === 0) {
                return;
            }

            const { isValid, error } = validateUrl(url);

            if (!isValid) {
                throw new Error(`Invalid ${field}: ${error}`);
            }
        });
    }

    private validateConfigProfile(config: Partial<INetworkConfig>): void {
        const { isValid, error } = validateNodeApiProfile(
            config.nodeApiProfile,
        );

        if (!isValid) {
            throw new Error(`Invalid nodeApiProfile: ${error}`);
        }
    }

    public initialize(config: TNetworksConfig): void {
        Object.values(config).forEach((networkConfig: INetworkConfig) => {
            this.validateConfigUrls(networkConfig, { allowEmpty: true });
            this.validateConfigProfile(networkConfig);
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
    public restoreCustomNetworks(records: IPersistedNetworkRecord[]): void {
        records.forEach((record: IPersistedNetworkRecord) => {
            if (!isNodeApiProfile(record.config.nodeApiProfile)) {
                console.warn(
                    `NetworkConfigProvider: Skipped stored network "${record.name}" with unknown nodeApiProfile "${String(record.config.nodeApiProfile)}"`,
                );

                return;
            }

            this.networksRecords!.set(record.id, {
                id: record.id,
                name: record.name,
                config: record.config,
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
        this.validateConfigProfile(networkConfig);
        ensureValid(
            validateNetworkUniqueness(name, networkConfig, this.getAll()),
            { context: "NetworkConfigProvider.add" },
        );

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

        if (update.config && update.config.nodeApiProfile !== undefined) {
            this.validateConfigProfile(update.config);
        }

        const record: INetworkRecord = this.networksRecords!.get(id)!;

        const name: NetworkName = update.name ?? record.name;

        const config: INetworkConfig = update.config
            ? {
                  ...record.config,
                  ...update.config,
                  nodeApiProfile:
                      update.config.nodeApiProfile ??
                      record.config.nodeApiProfile,
              }
            : record.config;

        ensureValid(
            validateNetworkUniqueness(
                name,
                config,
                this.getAll().filter(
                    (otherRecord: INetworkRecord) => otherRecord.id !== id,
                ),
            ),
            { context: "NetworkConfigProvider.update" },
        );

        record.name = name;
        record.config = config;
    }

    public isReady(): boolean {
        return this.networksRecords !== null;
    }
}
