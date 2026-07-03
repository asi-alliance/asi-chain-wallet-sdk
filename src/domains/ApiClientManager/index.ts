import IndexerClient from "@domains/IndexerClient";
import ObserverClient from "@domains/ObserverClient";
import ValidatorClient from "@domains/ValidatorClient";
import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import { INetworkConfig, NetworkName, TNetworksConfig } from "@domains/Network";
import {
    EnsureApiClientManagerConfigured,
    EnsureApiClientManagerInitialized,
} from "@utils/decorators";

export interface IApiClients {
    validator: ValidatorClient;
    observer: ObserverClient;
    indexer: IndexerClient;
}

export default class ApiClientManager {
    private static instance: ApiClientManager;

    private readonly networkConfigProvider: NetworkConfigProvider;

    private validatorClient: ValidatorClient | null = null;
    private observerClient: ObserverClient | null = null;
    private indexerClient: IndexerClient | null = null;

    private currentNetwork: NetworkName | null = null;

    private isInitialized: boolean = false;

    private constructor() {
        this.networkConfigProvider = new NetworkConfigProvider();
    }

    public static getInstance(): ApiClientManager {
        if (!ApiClientManager.instance) {
            ApiClientManager.instance = new ApiClientManager();
        }

        return ApiClientManager.instance;
    }

    public initialize(
        networksConfig: TNetworksConfig,
        network?: NetworkName,
    ): void {
        if (this.isInitialized) {
            return;
        }

        this.networkConfigProvider.initialize(networksConfig);

        const defaultNetwork: NetworkName =
            network ?? (Object.keys(networksConfig)[0] as NetworkName);

        this.switchNetwork(defaultNetwork);

        this.isInitialized = true;
    }

    @EnsureApiClientManagerConfigured
    public switchNetwork(network: NetworkName): void {
        const config: INetworkConfig = this.networkConfigProvider.get(network);

        this.validatorClient = new ValidatorClient({
            baseUrl: config.ValidatorURL,
        });

        this.observerClient = new ObserverClient({
            baseUrl: config.ReadOnlyURL,
        });

        this.indexerClient = new IndexerClient({
            baseUrl: config.IndexerURL,
        });

        this.currentNetwork = network;
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
    public getClients() {
        return {
            validator: this.validatorClient!,
            observer: this.observerClient!,
            indexer: this.indexerClient!,
        };
    }

    @EnsureApiClientManagerInitialized
    public getNetwork(): NetworkName {
        return this.currentNetwork!;
    }

    @EnsureApiClientManagerInitialized
    @EnsureApiClientManagerConfigured
    public getNetworkNames(): NetworkName[] {
        return this.networkConfigProvider.getNetworkNames();
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public close(): void {
        this.validatorClient = null;
        this.observerClient = null;
        this.indexerClient = null;

        this.currentNetwork = null;

        this.isInitialized = false;
    }
}
