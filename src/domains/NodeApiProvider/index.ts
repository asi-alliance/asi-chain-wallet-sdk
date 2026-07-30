import ApiClientManager from "@domains/ApiClientManager";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import { INetworkConfig } from "@domains/Network";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { createNodeApiAdapter } from "@utils/fabrics/nodeApiAdapter";

export default class NodeApiProvider {
    private static instance: NodeApiProvider;

    private readonly apiClientManager: ApiClientManager;
    private readonly adapters: Map<NodeApiProfile, NodeApiAdapter> = new Map();

    private constructor(apiClientManager: ApiClientManager) {
        this.apiClientManager = apiClientManager;
    }

    public static getInstance(
        apiClientManager?: ApiClientManager,
    ): NodeApiProvider {
        if (!NodeApiProvider.instance) {
            NodeApiProvider.instance = new NodeApiProvider(
                apiClientManager ?? ApiClientManager.getInstance(),
            );
        }

        return NodeApiProvider.instance;
    }

    public getApi(): NodeApiAdapter {
        const { config }: { config: INetworkConfig } =
            this.apiClientManager.getCurrentNetwork();

        const cached: NodeApiAdapter | undefined = this.adapters.get(
            config.nodeApiProfile,
        );

        if (cached) {
            return cached;
        }

        const adapter: NodeApiAdapter = createNodeApiAdapter(
            config.nodeApiProfile,
            this.apiClientManager,
        );

        this.adapters.set(config.nodeApiProfile, adapter);

        return adapter;
    }
}
