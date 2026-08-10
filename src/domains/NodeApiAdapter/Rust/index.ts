import NodeApiAdapter from "@domains/NodeApiAdapter";
import { RUST_FAULT_TOLERANCE_THRESHOLD } from "@utils/constants";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { IDeployInfo } from "@domains/Deploy";

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

    public isDeployFinalized(deploy: IDeployInfo): boolean {
        return (deploy.faultTolerance ?? 0) >= RUST_FAULT_TOLERANCE_THRESHOLD;
    }
}
