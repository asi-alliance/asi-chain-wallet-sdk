import {
    INetworkConfig,
    INetworkRecord,
    INetworkRecordInput,
    INetworkUpdate,
    IPersistedNetworkRecord,
    IResolvedNetworkConfig,
    NetworkId,
    NetworkName,
    TNetworksConfig,
} from "@domains/Network";
import {
    ensureValid,
    generateRandomId,
    validateNativeTokenDecimals,
    validateNetworkConfigUrls,
    validateNetworkUniqueness,
    validateNodeApiProfile,
} from "@utils/index";
import { isNativeTokenDecimals, isNodeApiProfile } from "@utils/guards";
import { createNetworkConfigSnapshot } from "@fabrics/network";
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
            ensureValid(
                validateNativeTokenDecimals(networkConfig.nativeTokenDecimals),
                { context: "NetworkConfigProvider.initialize" },
            );
        });

        this.networksRecords = new Map<NetworkId, INetworkRecord>(
            Object.entries(config).map(([name, networkConfig]) => [
                name,
                {
                    id: name,
                    name,
                    config: createNetworkConfigSnapshot(networkConfig),
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

            const { nativeTokenDecimals } = record.config;

            if (
                nativeTokenDecimals !== undefined &&
                !isNativeTokenDecimals(nativeTokenDecimals)
            ) {
                console.warn(
                    `NetworkConfigProvider: Skipped stored network "${record.name}" with invalid nativeTokenDecimals`,
                );

                return;
            }

            this.networksRecords!.set(record.id, {
                id: record.id,
                name: record.name,
                config: createNetworkConfigSnapshot(record.config),
                isDefault: false,
            });
        });
    }

    @EnsureNetworkConfigProviderReady
    public getAll(): INetworkRecord[] {
        return Array.from(this.networksRecords!.values()).map(
            (record: INetworkRecord) => ({ ...record }),
        );
    }

    @EnsureNetworkConfigProviderReady
    @EnsureNetworkExist
    public get(id: NetworkId): INetworkRecord {
        return { ...this.networksRecords!.get(id)! };
    }

    @EnsureNetworkConfigProviderReady
    public getIds(): NetworkId[] {
        return Array.from(this.networksRecords!.keys());
    }

    @EnsureNetworkConfigProviderReady
    @EnsureNetworkRecordNotDefault
    public set(record: INetworkRecordInput): void {
        ensureValid(
            validateNetworkConfigUrls(record.config, { allowEmpty: false }),
            { context: "NetworkConfigProvider.set" },
        );
        ensureValid(validateNodeApiProfile(record.config.nodeApiProfile), {
            context: "NetworkConfigProvider.set",
        });
        ensureValid(
            validateNativeTokenDecimals(record.config.nativeTokenDecimals),
            { context: "NetworkConfigProvider.set" },
        );

        const config: IResolvedNetworkConfig = createNetworkConfigSnapshot(
            record.config,
        );

        ensureValid(
            validateNetworkUniqueness(
                record.name,
                config,
                this.getAll().filter(
                    (otherRecord: INetworkRecord) =>
                        otherRecord.id !== record.id,
                ),
            ),
            { context: "NetworkConfigProvider.set" },
        );

        this.networksRecords!.set(record.id, { ...record, config });
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
        ensureValid(
            validateNativeTokenDecimals(networkConfig.nativeTokenDecimals),
            { context: "NetworkConfigProvider.add" },
        );

        const config: IResolvedNetworkConfig =
            createNetworkConfigSnapshot(networkConfig);

        ensureValid(validateNetworkUniqueness(name, config, this.getAll()), {
            context: "NetworkConfigProvider.add",
        });

        const record: INetworkRecord = {
            id: generateRandomId(),
            name,
            config,
            isDefault: false,
        };

        this.networksRecords!.set(record.id, { ...record });

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
            ensureValid(
                validateNativeTokenDecimals(update.config.nativeTokenDecimals),
                { context: "NetworkConfigProvider.update" },
            );
        }

        if (update.config && update.config.nodeApiProfile !== undefined) {
            ensureValid(validateNodeApiProfile(update.config.nodeApiProfile), {
                context: "NetworkConfigProvider.update",
            });
        }

        const record: INetworkRecord = this.networksRecords!.get(id)!;

        const name: NetworkName = update.name ?? record.name;

        const config: IResolvedNetworkConfig = update.config
            ? createNetworkConfigSnapshot({
                  ...record.config,
                  ...update.config,
                  nodeApiProfile:
                      update.config.nodeApiProfile ??
                      record.config.nodeApiProfile,
                  nativeTokenDecimals:
                      update.config.nativeTokenDecimals ??
                      record.config.nativeTokenDecimals,
              })
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
