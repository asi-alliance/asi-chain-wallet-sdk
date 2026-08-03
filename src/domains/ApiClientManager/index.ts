import IndexerClient from "@domains/IndexerClient";
import ObserverClient from "@domains/ObserverClient";
import ValidatorClient from "@domains/ValidatorClient";
import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import NetworkBusyRegistry from "@domains/NetworkBusyRegistry";
import {
    INetworkConfig,
    INetworkContext,
    INetworkRecord,
    INetworkUpdate,
    IPersistedNetworkRecord,
    NetworkId,
    NetworkName,
    TNetworkBusyListener,
    TNetworksConfig,
} from "@domains/Network";
import {
    EnsureApiClientManagerConfigured,
    EnsureApiClientManagerInitialized,
    EnsureCurrentNetworkNotBusy,
    EnsureTargetNetworkNotBusy,
} from "@utils/decorators/apiClientManager";
import { createApiClients } from "@utils/fabrics/apiClients";
import { createNodeApiAdapter } from "@utils/fabrics/nodeApiAdapter";

export interface IApiClients {
    validator: ValidatorClient;
    observer: ObserverClient;
    indexer: IndexerClient;
}

export default class ApiClientManager {
    private static instance: ApiClientManager;

    private readonly networkConfigProvider: NetworkConfigProvider;
    private readonly networkBusyRegistry: NetworkBusyRegistry;

    private validatorClient: ValidatorClient | null = null;
    private observerClient: ObserverClient | null = null;
    private indexerClient: IndexerClient | null = null;

    private currentNetworkId: NetworkId | null = null;

    private isInitialized: boolean = false;

    private constructor() {
        this.networkConfigProvider = new NetworkConfigProvider();
        this.networkBusyRegistry = new NetworkBusyRegistry();
    }

    public static getInstance(): ApiClientManager {
        if (!ApiClientManager.instance) {
            ApiClientManager.instance = new ApiClientManager();
        }

        return ApiClientManager.instance;
    }

    public initialize(
        networksConfig: TNetworksConfig,
        customNetworks: IPersistedNetworkRecord[] = [],
        networkName?: NetworkName,
    ): void {
        if (this.isInitialized) {
            return;
        }

        this.networkConfigProvider.initialize(networksConfig);
        this.networkConfigProvider.restoreCustomNetworks(customNetworks);

        const records: INetworkRecord[] = this.networkConfigProvider.getAll();
        const defaultRecord: INetworkRecord =
            (networkName
                ? records.find((record) => record.name === networkName)
                : records[0]) ?? records[0];

        this.switchNetwork(defaultRecord.id);

        this.isInitialized = true;
    }

    @EnsureApiClientManagerConfigured
    @EnsureCurrentNetworkNotBusy
    public switchNetwork(networkId: NetworkId): void {
        const { config } = this.networkConfigProvider.get(networkId);

        const { validator, observer, indexer }: IApiClients =
            createApiClients(config);

        this.validatorClient = validator;
        this.observerClient = observer;
        this.indexerClient = indexer;

        this.currentNetworkId = networkId;
    }

    @EnsureApiClientManagerInitialized
    public getValidatorClient(): ValidatorClient {
        return this.validatorClient!;
    }

    @EnsureApiClientManagerInitialized
    public getObserverClient(): ObserverClient {
        return this.observerClient!;
    }

    @EnsureApiClientManagerInitialized
    public getIndexerClient(): IndexerClient {
        return this.indexerClient!;
    }

    @EnsureApiClientManagerInitialized
    public getClients(): IApiClients {
        return {
            validator: this.validatorClient!,
            observer: this.observerClient!,
            indexer: this.indexerClient!,
        };
    }

    @EnsureApiClientManagerInitialized
    public getCurrentNetworkId(): NetworkId {
        return this.currentNetworkId!;
    }

    @EnsureApiClientManagerInitialized
    public getCurrentNetwork(): INetworkRecord {
        return this.networkConfigProvider.get(this.currentNetworkId!);
    }

    @EnsureApiClientManagerInitialized
    @EnsureApiClientManagerConfigured
    public getNetworkIds(): NetworkId[] {
        return this.networkConfigProvider.getIds();
    }

    @EnsureApiClientManagerInitialized
    public getNetworks(): INetworkRecord[] {
        return this.networkConfigProvider.getAll();
    }

    @EnsureApiClientManagerInitialized
    public getNetwork(id: NetworkId): INetworkRecord {
        return this.networkConfigProvider.get(id);
    }

    public isNetworkBusy(networkId: NetworkId): boolean {
        return this.networkBusyRegistry.isBusy(networkId);
    }

    @EnsureApiClientManagerInitialized
    public async runNetworkOperation<TResult>(
        operation: () => Promise<TResult>,
        onBusyChanged?: TNetworkBusyListener,
    ): Promise<TResult> {
        const networkId: NetworkId = this.getCurrentNetworkId();

        this.networkBusyRegistry.acquire(networkId);
        onBusyChanged?.(networkId, true);

        try {
            return await operation();
        } finally {
            this.networkBusyRegistry.release(networkId);
            onBusyChanged?.(networkId, this.isNetworkBusy(networkId));
        }
    }

    @EnsureApiClientManagerInitialized
    public createNetworkContext(networkId?: NetworkId): INetworkContext {
        const { id, name, config }: INetworkRecord =
            this.networkConfigProvider.get(networkId ?? this.currentNetworkId!);

        const clients: IApiClients = createApiClients(config);

        return {
            networkId: id,
            name,
            config,
            clients,
            api: createNodeApiAdapter(config.nodeApiProfile, clients),
        };
    }

    @EnsureApiClientManagerInitialized
    public addNetwork(
        name: NetworkName,
        config: INetworkConfig,
    ): INetworkRecord {
        return this.networkConfigProvider.add(name, config);
    }

    @EnsureApiClientManagerInitialized
    @EnsureTargetNetworkNotBusy
    public updateNetwork(id: NetworkId, update: INetworkUpdate): void {
        this.networkConfigProvider.update(id, update);

        if (this.currentNetworkId === id) {
            this.switchNetwork(id);
        }
    }

    @EnsureApiClientManagerInitialized
    @EnsureTargetNetworkNotBusy
    public removeNetwork(id: NetworkId): void {
        this.networkConfigProvider.remove(id);

        if (this.currentNetworkId === id) {
            const firstNetworkId: NetworkId =
                this.networkConfigProvider.getIds()[0];

            this.switchNetwork(firstNetworkId);
        }
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public close(): void {
        this.validatorClient = null;
        this.observerClient = null;
        this.indexerClient = null;

        this.currentNetworkId = null;

        this.networkBusyRegistry.clear();

        this.isInitialized = false;
    }
}
