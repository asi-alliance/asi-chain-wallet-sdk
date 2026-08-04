import NodeApiAdapter from "@domains/NodeApiAdapter";
import RustNodeApiAdapter from "@domains/NodeApiAdapter/Rust";
import ScalaNodeApiAdapter from "@domains/NodeApiAdapter/Scala";
import type { IApiClients } from "@domains/ApiClientManager";
import { NodeApiProfile } from "@domains/NodeApiProfile";

export const createNodeApiAdapter = (
    profile: NodeApiProfile,
    clients: IApiClients,
): NodeApiAdapter => {
    switch (profile) {
        case NodeApiProfile.SCALA:
            return new ScalaNodeApiAdapter(clients);

        case NodeApiProfile.RUST:
            return new RustNodeApiAdapter(clients);
    }
};