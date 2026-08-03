import ApiClientManager from "@domains/ApiClientManager";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import { INetworkConfig } from "@domains/Network";
import { createNodeApiAdapter } from "@utils/fabrics/nodeApiAdapter";

export default class NodeApiProvider {
    private static instance: NodeApiProvider;

    private readonly apiClientManager: ApiClientManager;

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

        return createNodeApiAdapter(
            config.nodeApiProfile,
            this.apiClientManager.getClients(),
        );
    }
}