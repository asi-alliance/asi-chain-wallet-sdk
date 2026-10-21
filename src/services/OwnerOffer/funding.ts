// Port of the encoders of the phlo funding intent (f1r3node-rust fe6cce76e):
// - models/src/rust/phlo_controls.rs
// - models/src/rust/phlo_resource.rs
// - models/src/rust/phlo_source.rs
// - models/src/rust/phlo_intent.rs and phlo_intent/v2.rs
//
// An owner-direct offer uses one source, no grant uses and no conversion.
// So this port has the V2 intent with an empty grant list and
// `NoConversion` only.

import {
    OwnerOfferError,
    asciiBytes,
    compareBytes,
    bytesEqual,
    u32be,
    u64be,
} from "./bytes";
import {
    PhloScheduleLimits,
    PhloScheduleV1,
    encodeSchedule,
} from "./schedule";
import { PhloWireLimits, encodeWireFields, nestedLimits } from "./wire";

export const PHLO_CONTROLS_V1_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:phlo-controls:v1",
);
export const PHLO_RESOURCE_V1_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:phlo-resource:v1",
);
export const PHLO_SOURCE_V1_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:phlo-source:v1",
);
export const PHLO_FUNDING_INTENT_V1_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:phlo-funding-intent:v1",
);
export const PHLO_FUNDING_INTENT_V2_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:phlo-funding-intent:v2",
);

export const PhloFundingErrorMessage = {
    CONTROLS_OWNER_LIMIT:
        "phlo controls exceed the required-owner entry limit",
    CONTROLS_SCHEDULE_LIMIT:
        "phlo controls exceed the permitted-schedule entry limit",
    CONTROLS_CLASS_LIMIT:
        "phlo controls exceed the aggregate resource-class limit",
    RESOURCE_NODE_LIMIT: "phlo resource key exceeds the authority-node limit",
    RESOURCE_AUTHORITY_SHAPE:
        "phlo resource key does not contain exactly one complete authority tree",
    SOURCE_EMPTY_CUSTODY:
        "phlo source policy requires a nonempty custody identity",
    SOURCE_PERMISSION_LIMIT:
        "phlo source policy exceeds its permission-entry limit",
    SOURCE_NODE_LIMIT:
        "phlo source policy exceeds its aggregate authority-node limit",
    INTENT_SOURCE_LIMIT: "phlo funding intent exceeds its source limit",
    INTENT_DUPLICATE_CUSTODY:
        "phlo funding intent repeats a physical custody identity",
    INTENT_PERMISSION_LIMIT:
        "phlo funding intent exceeds its aggregate resource-permission limit",
    INTENT_NODE_LIMIT:
        "phlo funding intent exceeds its aggregate authority-node limit",
    WIRE_LIMIT_EXCEEDED: "phlo wire data exceeds its byte limit",
    FIELD_WIDTH: "phlo funding-intent field has a noncanonical width",
} as const;

const fail = (message: string): never => {
    throw new OwnerOfferError(message);
};

// `models::rust::phlo_controls::PhloControlsLimits`.
export interface PhloControlsLimits {
    wire: PhloWireLimits;
    owners: number;
    schedules: number;
    totalClasses: number;
}

// `models::rust::phlo_intent::PhloFundingIntentLimits`.
export interface PhloFundingIntentLimits {
    wire: PhloWireLimits;
    controls: PhloControlsLimits;
    sources: number;
    resourcePermissions: number;
    authorityNodes: number;
}

// `models::rust::phlo_source::PhloSourceLimits`.
export interface PhloSourceLimits {
    wire: PhloWireLimits;
    resourcePermissions: number;
    authorityNodes: number;
}

// `models::rust::phlo_resource::PhloResourceLimits`.
export interface PhloResourceLimits {
    wire: PhloWireLimits;
    authorityNodes: number;
}

// `models::rust::phlo_intent::PhloFundingIntentV2Limits`.
export interface PhloFundingIntentV2Limits {
    wire: PhloWireLimits;
    base: PhloFundingIntentLimits;
    grantUses: number;
    grantIdBytes: number;
    quoteEvidenceBytes: number;
}

export interface PhloControlsV1 {
    limit: number;
    priceCeiling: number;
    requiredOwnerCeilings: number[];
    permittedSchedules: PhloScheduleV1[];
}

// `models::rust::phlo_resource::PhloAuthorityNode`, with the wire tags.
export type PhloAuthorityNode =
    | { kind: "unit" }
    | { kind: "ground"; bytes: Uint8Array }
    | { kind: "quote"; bytes: Uint8Array }
    | { kind: "and" };

export interface PhloResourceKeyV1 {
    location: Uint8Array;
    classIndex: number;
    acquisitionTerms: Uint8Array;
    authority: PhloAuthorityNode[];
}

// Caps are u64 values as 8 big-endian bytes, because a REV ceiling can be
// above 2^53 - 1.
export interface PhloSourcePolicyV1 {
    custody: Uint8Array;
    holdCap: Uint8Array;
    debitCap: Uint8Array;
    feePermitted: boolean;
    resources: PhloResourceKeyV1[];
}

// The total exposure is a u128 value as 16 big-endian bytes.
export interface PhloFundingIntentV1 {
    controls: PhloControlsV1;
    scheduleCommitment: Uint8Array;
    totalExposure: Uint8Array;
    sources: PhloSourcePolicyV1[];
}

const controlsLimitsOf = (
    limits: PhloFundingIntentLimits,
): PhloControlsLimits => ({
    wire: {
        totalBytes: Math.min(
            limits.controls.wire.totalBytes,
            limits.wire.fieldBytes,
        ),
        fieldBytes: Math.min(
            limits.controls.wire.fieldBytes,
            limits.wire.fieldBytes,
        ),
    },
    owners: limits.controls.owners,
    schedules: limits.controls.schedules,
    totalClasses: limits.controls.totalClasses,
});

export const scheduleLimitsOfControls = (
    limits: PhloControlsLimits,
    remainingClasses: number,
): PhloScheduleLimits => ({
    wire: nestedLimits(limits.wire),
    classes: Math.min(remainingClasses, limits.totalClasses),
});

export const encodeControls = (
    controls: PhloControlsV1,
    limits: PhloControlsLimits,
): Uint8Array => {
    if (controls.requiredOwnerCeilings.length > limits.owners) {
        fail(PhloFundingErrorMessage.CONTROLS_OWNER_LIMIT);
    }

    if (controls.permittedSchedules.length > limits.schedules) {
        fail(PhloFundingErrorMessage.CONTROLS_SCHEDULE_LIMIT);
    }

    let remainingClasses: number = limits.totalClasses;

    for (let index = 0; index < controls.permittedSchedules.length; index += 1) {
        remainingClasses -= controls.permittedSchedules[index].classes.length;

        if (remainingClasses < 0) {
            fail(PhloFundingErrorMessage.CONTROLS_CLASS_LIMIT);
        }
    }

    const owners: Uint8Array[] = [u32be(controls.requiredOwnerCeilings.length)];

    for (
        let index = 0;
        index < controls.requiredOwnerCeilings.length;
        index += 1
    ) {
        owners.push(u64be(controls.requiredOwnerCeilings[index]));
    }

    const schedules: Uint8Array[] = [u32be(controls.permittedSchedules.length)];

    for (let index = 0; index < controls.permittedSchedules.length; index += 1) {
        const schedule: PhloScheduleV1 = controls.permittedSchedules[index];

        schedules.push(
            encodeSchedule(
                schedule,
                scheduleLimitsOfControls(limits, schedule.classes.length),
            ),
        );
    }

    return encodeWireFields(
        [
            PHLO_CONTROLS_V1_DOMAIN,
            u64be(controls.limit),
            u64be(controls.priceCeiling),
            encodeWireFields(owners, nestedLimits(limits.wire)),
            encodeWireFields(schedules, nestedLimits(limits.wire)),
        ],
        limits.wire,
    );
};

const authorityNodeFields = (
    node: PhloAuthorityNode,
): [Uint8Array, Uint8Array] => {
    switch (node.kind) {
        case "unit":
            return [new Uint8Array([0]), new Uint8Array(0)];
        case "ground":
            return [new Uint8Array([1]), node.bytes];
        case "quote":
            return [new Uint8Array([2]), node.bytes];
        case "and":
            return [new Uint8Array([3]), new Uint8Array(0)];
    }
};

// Checks that the pre-order node list forms exactly one complete tree:
// `And` takes two subtrees, every other node is a leaf.
const checkAuthorityShape = (authority: PhloAuthorityNode[]): void => {
    let slots: number = 1;

    for (let index = 0; index < authority.length; index += 1) {
        if (slots === 0) {
            fail(PhloFundingErrorMessage.RESOURCE_AUTHORITY_SHAPE);
        }

        slots -= 1;

        if (authority[index].kind === "and") {
            slots += 2;
        }
    }

    if (slots !== 0) {
        fail(PhloFundingErrorMessage.RESOURCE_AUTHORITY_SHAPE);
    }
};

export const encodeResourceKey = (
    key: PhloResourceKeyV1,
    limits: PhloResourceLimits,
): Uint8Array => {
    if (key.authority.length === 0) {
        fail(PhloFundingErrorMessage.RESOURCE_AUTHORITY_SHAPE);
    }

    if (key.authority.length > limits.authorityNodes) {
        fail(PhloFundingErrorMessage.RESOURCE_NODE_LIMIT);
    }

    checkAuthorityShape(key.authority);

    const nodes: Uint8Array[] = [u32be(key.authority.length)];

    for (let index = 0; index < key.authority.length; index += 1) {
        nodes.push(
            encodeWireFields(
                authorityNodeFields(key.authority[index]),
                nestedLimits(limits.wire),
            ),
        );
    }

    return encodeWireFields(
        [
            PHLO_RESOURCE_V1_DOMAIN,
            key.location,
            u32be(key.classIndex),
            key.acquisitionTerms,
            encodeWireFields(nodes, nestedLimits(limits.wire)),
        ],
        limits.wire,
    );
};

const resourceLimitsOf = (
    limits: PhloSourceLimits,
    authorityNodes: number,
): PhloResourceLimits => ({
    wire: nestedLimits(limits.wire),
    authorityNodes,
});

const checkSourceHeader = (
    custody: Uint8Array,
    count: number,
    limits: PhloSourceLimits,
): void => {
    if (custody.length === 0) {
        fail(PhloFundingErrorMessage.SOURCE_EMPTY_CUSTODY);
    }

    if (custody.length > limits.wire.fieldBytes) {
        fail(PhloFundingErrorMessage.WIRE_LIMIT_EXCEEDED);
    }

    if (count > limits.resourcePermissions) {
        fail(PhloFundingErrorMessage.SOURCE_PERMISSION_LIMIT);
    }
};

export const encodeSourcePolicy = (
    policy: PhloSourcePolicyV1,
    limits: PhloSourceLimits,
): Uint8Array => {
    checkSourceHeader(policy.custody, policy.resources.length, limits);

    if (policy.holdCap.length !== 8 || policy.debitCap.length !== 8) {
        fail(PhloFundingErrorMessage.FIELD_WIDTH);
    }

    const permissions: Uint8Array[] = [u32be(policy.resources.length)];
    let remainingNodes: number = limits.authorityNodes;

    for (let index = 0; index < policy.resources.length; index += 1) {
        const resource: PhloResourceKeyV1 = policy.resources[index];

        remainingNodes -= resource.authority.length;

        if (remainingNodes < 0) {
            fail(PhloFundingErrorMessage.SOURCE_NODE_LIMIT);
        }

        permissions.push(
            encodeResourceKey(
                resource,
                resourceLimitsOf(limits, resource.authority.length),
            ),
        );
    }

    return encodeWireFields(
        [
            PHLO_SOURCE_V1_DOMAIN,
            policy.custody,
            policy.holdCap,
            policy.debitCap,
            new Uint8Array([policy.feePermitted ? 1 : 0]),
            encodeWireFields(permissions, nestedLimits(limits.wire)),
        ],
        limits.wire,
    );
};

// `PhloSourcePolicyV1::new`: the permissions are sorted by their canonical
// key bytes and repeated keys are removed.
export const createSourcePolicy = (
    custody: Uint8Array,
    holdCap: Uint8Array,
    debitCap: Uint8Array,
    feePermitted: boolean,
    resources: PhloResourceKeyV1[],
    limits: PhloSourceLimits,
): PhloSourcePolicyV1 => {
    checkSourceHeader(custody, resources.length, limits);

    let remainingNodes: number = limits.authorityNodes;
    let remainingBytes: number = limits.wire.fieldBytes - 12;

    if (remainingBytes < 0) {
        fail(PhloFundingErrorMessage.WIRE_LIMIT_EXCEEDED);
    }

    const records: { bytes: Uint8Array; resource: PhloResourceKeyV1 }[] = new Array(
        resources.length,
    );

    for (let index = 0; index < resources.length; index += 1) {
        const resource: PhloResourceKeyV1 = resources[index];

        remainingNodes -= resource.authority.length;

        if (remainingNodes < 0) {
            fail(PhloFundingErrorMessage.SOURCE_NODE_LIMIT);
        }

        const bytes: Uint8Array = encodeResourceKey(
            resource,
            resourceLimitsOf(limits, resource.authority.length),
        );

        remainingBytes -= bytes.length + 8;

        if (remainingBytes < 0) {
            fail(PhloFundingErrorMessage.WIRE_LIMIT_EXCEEDED);
        }

        records[index] = { bytes, resource };
    }

    records.sort((left, right) => compareBytes(left.bytes, right.bytes));

    const canonical: PhloResourceKeyV1[] = [];

    for (let index = 0; index < records.length; index += 1) {
        if (index > 0 && bytesEqual(records[index - 1].bytes, records[index].bytes)) {
            continue;
        }

        canonical.push(records[index].resource);
    }

    const policy: PhloSourcePolicyV1 = {
        custody,
        holdCap,
        debitCap,
        feePermitted,
        resources: canonical,
    };

    encodeSourcePolicy(policy, limits);

    return policy;
};

const sourceLimitsOf = (limits: PhloFundingIntentLimits): PhloSourceLimits => ({
    wire: nestedLimits(limits.wire),
    resourcePermissions: limits.resourcePermissions,
    authorityNodes: limits.authorityNodes,
});

export const encodeFundingIntentV1 = (
    intent: PhloFundingIntentV1,
    limits: PhloFundingIntentLimits,
): Uint8Array => {
    if (intent.sources.length > limits.sources) {
        fail(PhloFundingErrorMessage.INTENT_SOURCE_LIMIT);
    }

    if (intent.scheduleCommitment.length !== 32 || intent.totalExposure.length !== 16) {
        fail(PhloFundingErrorMessage.FIELD_WIDTH);
    }

    const remaining: PhloSourceLimits = sourceLimitsOf(limits);
    const sources: Uint8Array[] = [u32be(intent.sources.length)];

    for (let index = 0; index < intent.sources.length; index += 1) {
        const source: PhloSourcePolicyV1 = intent.sources[index];

        for (let prior = 0; prior < index; prior += 1) {
            if (bytesEqual(intent.sources[prior].custody, source.custody)) {
                fail(PhloFundingErrorMessage.INTENT_DUPLICATE_CUSTODY);
            }
        }

        sources.push(encodeSourcePolicy(source, remaining));

        remaining.resourcePermissions -= source.resources.length;

        if (remaining.resourcePermissions < 0) {
            fail(PhloFundingErrorMessage.INTENT_PERMISSION_LIMIT);
        }

        for (let key = 0; key < source.resources.length; key += 1) {
            remaining.authorityNodes -= source.resources[key].authority.length;

            if (remaining.authorityNodes < 0) {
                fail(PhloFundingErrorMessage.INTENT_NODE_LIMIT);
            }
        }
    }

    return encodeWireFields(
        [
            PHLO_FUNDING_INTENT_V1_DOMAIN,
            encodeControls(intent.controls, controlsLimitsOf(limits)),
            intent.scheduleCommitment,
            intent.totalExposure,
            encodeWireFields(sources, nestedLimits(limits.wire)),
        ],
        limits.wire,
    );
};

const baseLimitsOfV2 = (
    limits: PhloFundingIntentV2Limits,
): PhloFundingIntentLimits => ({
    wire: {
        totalBytes: Math.min(limits.base.wire.totalBytes, limits.wire.fieldBytes),
        fieldBytes: Math.min(limits.base.wire.fieldBytes, limits.wire.fieldBytes),
    },
    controls: limits.base.controls,
    sources: limits.base.sources,
    resourcePermissions: limits.base.resourcePermissions,
    authorityNodes: limits.base.authorityNodes,
});

// `PhloFundingIntentV2::encode` with `grant_uses` empty and
// `PhloConversionCompositionV2::NoConversion`.
export const encodeFundingIntentV2NoConversion = (
    base: PhloFundingIntentV1,
    limits: PhloFundingIntentV2Limits,
): Uint8Array =>
    encodeWireFields(
        [
            PHLO_FUNDING_INTENT_V2_DOMAIN,
            encodeFundingIntentV1(base, baseLimitsOfV2(limits)),
            encodeWireFields([u32be(0)], nestedLimits(limits.wire)),
            encodeWireFields([new Uint8Array([0])], nestedLimits(limits.wire)),
        ],
        limits.wire,
    );
