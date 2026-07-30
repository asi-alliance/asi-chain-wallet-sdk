import ApiClientManager from "@domains/ApiClientManager";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import RustNodeApiAdapter from "@domains/NodeApiAdapter/Rust";
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
            return new RustNodeApiAdapter(apiClientManager);
    }
};
