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

    protected buildExploreDeployBody(
        term: string,
    ): ISimpleExploreDeployRequest {
        return { term };
    }
}
