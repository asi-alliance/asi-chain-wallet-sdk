import {
    INetworkConfig,
    INetworkRecord,
    INetworkUpdate,
    IPersistedNetworkRecord,
    NetworkId,
    NetworkName,
    TNetworksConfig,
} from "@domains/Network";
import {
    ensureValid,
    generateRandomId,
    validateNetworkConfigUrls,
    validateNodeApiProfile,
} from "@utils/index";
import { isNodeApiProfile } from "@utils/guards";
import {
    EnsureNetworkConfigProviderReady,
    EnsureNetworkExist,
    EnsureNetworkNotDefault,
    EnsureNetworkRecordNotDefault,
} from "@utils/decorators/networkConfigProvider";

export default class NetworkConfigProvider {
    private networksRecords: Map<NetworkId, INetworkRecord> | null = null;

    public initialize(config: TNetworksConfig): void {
        Object.values(config).forEach((networkConfig: INetworkConfig) => {
            ensureValid(
                validateNetworkConfigUrls(networkConfig, { allowEmpty: true }),
                { context: "NetworkConfigProvider.initialize" },
            );
            ensureValid(validateNodeApiProfile(networkConfig.nodeApiProfile), {
                context: "NetworkConfigProvider.initialize",
            });
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
    @EnsureNetworkRecordNotDefault
    public set(record: INetworkRecord): void {
        ensureValid(
            validateNetworkConfigUrls(record.config, { allowEmpty: false }),
            { context: "NetworkConfigProvider.set" },
        );
        ensureValid(validateNodeApiProfile(record.config.nodeApiProfile), {
            context: "NetworkConfigProvider.set",
        });

        this.networksRecords!.set(record.id, record);
    }

    @EnsureNetworkConfigProviderReady
    public add(
        name: NetworkName,
        networkConfig: INetworkConfig,
    ): INetworkRecord {
        ensureValid(
            validateNetworkConfigUrls(networkConfig, { allowEmpty: false }),
            { context: "NetworkConfigProvider.add" },
        );
        ensureValid(validateNodeApiProfile(networkConfig.nodeApiProfile), {
            context: "NetworkConfigProvider.add",
        });

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
            ensureValid(
                validateNetworkConfigUrls(update.config, { allowEmpty: false }),
                { context: "NetworkConfigProvider.update" },
            );
        }

        if (update.config && update.config.nodeApiProfile !== undefined) {
            ensureValid(validateNodeApiProfile(update.config.nodeApiProfile), {
                context: "NetworkConfigProvider.update",
            });
        }

        const record: INetworkRecord = this.networksRecords!.get(id)!;

        if (update.name !== undefined) {
            record.name = update.name;
        }

        if (update.config) {
            const { nodeApiProfile, ...endpoints } = update.config;

            record.config = {
                ...record.config,
                ...endpoints,
                nodeApiProfile: nodeApiProfile ?? record.config.nodeApiProfile,
            };
        }
    }

    public isReady(): boolean {
        return this.networksRecords !== null;
    }
}
