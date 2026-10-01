export enum NodeApiProfile {
    SCALA = "scala",
    RUST = "rust",
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
