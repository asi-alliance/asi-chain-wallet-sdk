import {
    INetworkConfig,
    INetworkRecord,
    NetworkName,
    TNetworksConfig,
} from "@domains/Network";
import {
    EnsureNetworkConfigProviderReady,
    EnsureNetworkExist,
    EnsureNetworkNotDefault,
} from "@utils/decorators/networkConfigProvider";

export default class NetworkConfigProvider {
    private networksRecords: Map<NetworkName, INetworkRecord> | null = null;

    public initialize(config: TNetworksConfig): void {
        this.networksRecords = new Map<NetworkName, INetworkRecord>(
            Object.entries(config).map(([name, config]) => [
                name,
                {
                    config,
                    isDefault: true,
                },
            ]),
        );
    }

    @EnsureNetworkConfigProviderReady
    public getAll(): INetworkRecord[] {
        return Array.from(this.networksRecords!.values());
    }

    @EnsureNetworkConfigProviderReady
    @EnsureNetworkExist
    public get(network: NetworkName): INetworkRecord {
        return this.networksRecords!.get(network)!;
    }

    @EnsureNetworkConfigProviderReady
    public getNetworkNames(): NetworkName[] {
        if (!this.networksRecords) {
            throw new Error("Network config is not initialized");
        }

        return Object.keys(this.networksRecords) as NetworkName[];
    }

    @EnsureNetworkConfigProviderReady
    public add(name: NetworkName, networkConfig: INetworkConfig): void {
        this.networksRecords!.set(name, {
            isDefault: false,
            config: networkConfig,
        });
    }

    @EnsureNetworkConfigProviderReady
    @EnsureNetworkExist
    @EnsureNetworkNotDefault
    public remove(name: NetworkName): INetworkRecord {
        const targetConfig: INetworkRecord = Object.assign(
            this.networksRecords!.get(name)!,
        );

        this.networksRecords!.delete(name);

        return targetConfig;
    }

    @EnsureNetworkConfigProviderReady
    @EnsureNetworkExist
    @EnsureNetworkNotDefault
    public update(name: NetworkName, config: Partial<INetworkConfig>): void {
        const targetConfig: INetworkRecord = this.networksRecords!.get(name)!;

        targetConfig.config = { ...targetConfig.config, ...config };
    }

    public isReady(): boolean {
        return this.networksRecords !== null;
    }
}
