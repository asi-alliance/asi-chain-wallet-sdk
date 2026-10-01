import { INetworkContext, NetworkId } from "@domains/Network";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import { NodeApiProfile } from "@domains/NodeApiProfile";

export default abstract class ApiWorker {
    protected readonly networkContext: INetworkContext;

    constructor(networkContext: INetworkContext) {
        this.networkContext = networkContext;
    }

    public getApi(): NodeApiAdapter {
        return this.networkContext.api;
    }

    public getNetworkId(): NetworkId {
        return this.networkContext.networkId;
    }

    public getNodeApiProfile(): NodeApiProfile {
        return this.networkContext.config.nodeApiProfile;
    }
}