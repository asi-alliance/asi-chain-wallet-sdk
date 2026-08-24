import { NodeApiProfile } from "@domains/NodeApiProfile";
import { INetworkConfig, NetworkName, TNetworksConfig } from "@domains/Network";

export const SCALA_NETWORK: NetworkName = "ScalaTestNet";
export const RUST_NETWORK: NetworkName = "RustTestNet";

const SCALA_NETWORK_CONFIG: INetworkConfig = {
    ValidatorURL: "http://scala-validator.test:40403",
    ReadOnlyURL: "http://scala-observer.test:40403",
    IndexerURL: "http://scala-indexer.test:8080/v1/graphql",
    nodeApiProfile: NodeApiProfile.SCALA,
};

const RUST_NETWORK_CONFIG: INetworkConfig = {
    ValidatorURL: "http://rust-validator.test:40413",
    ReadOnlyURL: "http://rust-observer.test:40453",
    IndexerURL: "http://rust-indexer.test:8080/v1/graphql",
    nodeApiProfile: NodeApiProfile.RUST,
};

export const NETWORKS_CONFIG: TNetworksConfig = {
    [SCALA_NETWORK]: SCALA_NETWORK_CONFIG,
    [RUST_NETWORK]: RUST_NETWORK_CONFIG,
};

export const CUSTOM_NETWORK_CONFIG: INetworkConfig = {
    ValidatorURL: "http://custom-validator.test:40413",
    ReadOnlyURL: "http://custom-observer.test:40453",
    IndexerURL: "http://custom-indexer.test:8080/v1/graphql",
    nodeApiProfile: NodeApiProfile.RUST,
};