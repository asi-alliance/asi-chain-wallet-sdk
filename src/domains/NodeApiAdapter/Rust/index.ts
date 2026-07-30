import NodeApiAdapter, {
    IExploratoryDeployClient,
} from "@domains/NodeApiAdapter";
import { NodeApiProfile } from "@domains/NodeApiProfile";

interface ISimpleExploreDeployRequest {
    term: string;
}

export default class RustNodeApiAdapter extends NodeApiAdapter {
    public getProfile(): NodeApiProfile {
        return NodeApiProfile.RUST;
    }

    protected getExploreDeployClient(): IExploratoryDeployClient {
        return this.clients.observer;
    }

    protected buildExploreDeployBody(
        term: string,
    ): ISimpleExploreDeployRequest {
        return { term };
    }
}
