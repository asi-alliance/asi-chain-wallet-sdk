import NodeApiAdapter from "@domains/NodeApiAdapter";
import { RUST_FAULT_TOLERANCE_THRESHOLD } from "@utils/constants";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { IDeployInfo } from "@domains/Deploy";
import type { IApiClients } from "@domains/ApiClientManager";

interface ISimpleExploreDeployRequest {
    term: string;
}

export default class RustNodeApiAdapter extends NodeApiAdapter {
    constructor(
        clients: IApiClients,
        private readonly profile: NodeApiProfile = NodeApiProfile.RUST,
    ) {
        super(clients);
        if (profile !== NodeApiProfile.RUST && profile !== NodeApiProfile.RUST_UINT256) {
            throw new Error("Invalid Rust API profile");
        }
    }

    public getProfile(): NodeApiProfile {
        return this.profile;
    }

    public getValidatorStatus(): Promise<unknown> {
        return this.profile === NodeApiProfile.RUST_UINT256
            ? this.clients.validator.getRustStatus()
            : super.getValidatorStatus();
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
