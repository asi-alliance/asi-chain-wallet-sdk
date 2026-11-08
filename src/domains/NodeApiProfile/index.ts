export enum NodeApiProfile {
    SCALA = "scala",
    RUST = "rust",
    RUST_UINT256 = "rust-uint256",
}

export enum NodeApiProfileStability {
    STABLE = "stable",
    EXPERIMENTAL = "experimental",
}

export const DEFAULT_NODE_API_PROFILE: NodeApiProfile = NodeApiProfile.SCALA;

export const NODE_API_PROFILES: NodeApiProfile[] =
    Object.values(NodeApiProfile);

export interface INodeApiProfileDescriptor {
    profile: NodeApiProfile;
    label: string;
    description: string;
    stability: NodeApiProfileStability;
}

export const NODE_API_PROFILE_DESCRIPTORS: Record<
    NodeApiProfile,
    INodeApiProfileDescriptor
> = {
    [NodeApiProfile.RUST_UINT256]: {
        profile: NodeApiProfile.RUST_UINT256,
        label: "Rust node (uint256)",
        description: "Explicit uint256 monetary APIs and field-15 deploy signing.",
        stability: NodeApiProfileStability.EXPERIMENTAL,
    },
    [NodeApiProfile.SCALA]: {
        profile: NodeApiProfile.SCALA,
        label: "Scala node",
        description: "Legacy f1r3node implementation.",
        stability: NodeApiProfileStability.STABLE,
    },
    [NodeApiProfile.RUST]: {
        profile: NodeApiProfile.RUST,
        label: "Rust node",
        description: "New f1r3node implementation.",
        stability: NodeApiProfileStability.EXPERIMENTAL,
    },
};
