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
        // Changed for the cost-accounted f1r3node (S-5): `/api/deploy/{id}`
        // returns `isFinalized` and no `faultTolerance`, so this threshold
        // check never reported a finalized deploy.
        // return (deploy.faultTolerance ?? 0) >= RUST_FAULT_TOLERANCE_THRESHOLD;
        return deploy.isFinalized === true;
    }
}
