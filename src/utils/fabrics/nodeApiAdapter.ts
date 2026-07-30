import ApiClientManager from "@domains/ApiClientManager";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import ScalaNodeApiAdapter from "@domains/NodeApiAdapter/Scala";
import { NodeApiProfile } from "@domains/NodeApiProfile";

export const createNodeApiAdapter = (
    profile: NodeApiProfile,
    apiClientManager: ApiClientManager,
): NodeApiAdapter => {
    switch (profile) {
        case NodeApiProfile.SCALA:
            return new ScalaNodeApiAdapter(apiClientManager);

        case NodeApiProfile.RUST:
            throw new Error(
                `createNodeApiAdapter: Node api profile "${profile}" is not implemented yet`,
            );
    }
};
