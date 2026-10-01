import {
    IDeployTermFactory,
    createCheckBalanceDeploy,
    createTransferDeploy,
} from "@domains/Deploy/factory";
import {
    createRustCheckBalanceDeploy,
    createRustTransferDeploy,
} from "@domains/Deploy/factory/rust";
import { NodeApiProfile } from "@domains/NodeApiProfile";

const SCALA_DEPLOY_TERMS: IDeployTermFactory = {
    createCheckBalanceDeploy,
    createTransferDeploy,
};

const RUST_DEPLOY_TERMS: IDeployTermFactory = {
    createCheckBalanceDeploy: createRustCheckBalanceDeploy,
    createTransferDeploy: createRustTransferDeploy,
};

export const createDeployTermFactory = (
    profile: NodeApiProfile,
): IDeployTermFactory => {
    switch (profile) {
        case NodeApiProfile.SCALA:
            return SCALA_DEPLOY_TERMS;

        case NodeApiProfile.RUST:
            return RUST_DEPLOY_TERMS;
    }
};