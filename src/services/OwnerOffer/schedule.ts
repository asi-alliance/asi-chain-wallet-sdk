// Port of models/src/rust/phlo_schedule.rs (f1r3node-rust fe6cce76e).
//
// A genesis resource policy is data: the hexadecimal `resource-policy` of the
// shard's genesis configuration. `decodeGenesisPolicy` turns it into the
// schedule that an owner-direct offer signs.

import {
    OwnerOfferError,
    asciiBytes,
    bytesEqual,
    hexToBytes,
    readUnsignedBE,
    u32be,
    u64be,
    u8be,
} from "./bytes";
import {
    PhloWireDecoder,
    PhloWireLimits,
    encodeWireFields,
    nestedLimits,
} from "./wire";

export const PHLO_SCHEDULE_V1_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:phlo-schedule:v1",
);
export const PHLO_GENESIS_POLICY_V1_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:genesis-resource-policy:v1",
);
export const PHLO_GENESIS_POLICY_V2_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:genesis-resource-policy:v2",
);

export interface PhloScheduleLimits {
    wire: PhloWireLimits;
    classes: number;
}

// `PhloGenesisPolicy::LIMITS`.
export const GENESIS_POLICY_LIMITS: PhloScheduleLimits = {
    wire: { totalBytes: 1048576, fieldBytes: 524288 },
    classes: 4096,
};

export interface PhloResourceClassV1 {
    identity: Uint8Array;
    measurementUnit: Uint8Array;
    measurementRule: Uint8Array;
    valuationRule: Uint8Array;
    weight: number;
}

export interface PhloScheduleV1 {
    protocolVersion: number;
    network: Uint8Array;
    shard: Uint8Array;
    settlementAsset: Uint8Array;
    settlementUnit: Uint8Array;
    decimalScale: number;
    classes: PhloResourceClassV1[];
    actualPrice: number;
    compatibilityRule: Uint8Array;
}

export interface PhloGenesisPolicy {
    schedule: PhloScheduleV1;
    scheduleBytes: Uint8Array;
    offeredFundedV6Active: boolean;
}

export const PhloScheduleErrorMessage = {
    GENESIS_POLICY_PRICE:
        "genesis resource policy must not contain an offered price",
    GENESIS_POLICY_ACTIVATION:
        "genesis resource policy has a noncanonical offered-funded activation",
    GENESIS_POLICY_CANONICAL:
        "genesis resource policy wire encoding is noncanonical",
    FORMAT_DOMAIN: "unsupported phlo schedule format domain",
    EMPTY_IDENTITY: "phlo schedule requires nonempty identities",
    EMPTY_CLASSES: "phlo schedule requires resource classes",
    CLASS_LIMIT: "phlo schedule exceeds the resource-class limit",
    DUPLICATE_CLASS: "phlo schedule repeats a resource-class identity",
    FIELD_WIDTH: "phlo schedule field has a noncanonical width",
    FEE_POLICY: "phlo schedule fee differs from the fixed one-unit policy",
    // Not a node error: this encoder keeps u64 values as safe integers.
    UNSAFE_INTEGER:
        "phlo schedule holds a u64 value above 2^53 - 1, which this encoder cannot represent",
} as const;

const fail = (message: string): never => {
    throw new OwnerOfferError(message);
};

const fixedField = (decoder: PhloWireDecoder, width: number): Uint8Array => {
    const field: Uint8Array = decoder.bytes();

    if (field.length !== width) {
        fail(PhloScheduleErrorMessage.FIELD_WIDTH);
    }

    return field;
};

const fixedUnsigned = (decoder: PhloWireDecoder, width: number): number => {
    const value: number = readUnsignedBE(fixedField(decoder, width));

    if (value < 0) {
        fail(PhloScheduleErrorMessage.UNSAFE_INTEGER);
    }

    return value;
};

const validateSchedule = (
    schedule: PhloScheduleV1,
    limits: PhloScheduleLimits,
): void => {
    if (schedule.classes.length === 0) {
        fail(PhloScheduleErrorMessage.EMPTY_CLASSES);
    }

    if (schedule.classes.length > limits.classes) {
        fail(PhloScheduleErrorMessage.CLASS_LIMIT);
    }

    const identities: Uint8Array[] = [
        schedule.network,
        schedule.shard,
        schedule.settlementAsset,
        schedule.settlementUnit,
    ];

    for (let index = 0; index < identities.length; index += 1) {
        if (identities[index].length === 0) {
            fail(PhloScheduleErrorMessage.EMPTY_IDENTITY);
        }
    }

    for (let index = 0; index < schedule.classes.length; index += 1) {
        const resourceClass: PhloResourceClassV1 = schedule.classes[index];

        if (
            resourceClass.identity.length === 0 ||
            resourceClass.measurementUnit.length === 0
        ) {
            fail(PhloScheduleErrorMessage.EMPTY_IDENTITY);
        }

        for (let prior = 0; prior < index; prior += 1) {
            if (
                bytesEqual(schedule.classes[prior].identity, resourceClass.identity)
            ) {
                fail(PhloScheduleErrorMessage.DUPLICATE_CLASS);
            }
        }
    }
};

export const encodeSchedule = (
    schedule: PhloScheduleV1,
    limits: PhloScheduleLimits,
): Uint8Array => {
    validateSchedule(schedule, limits);

    const classFields: Uint8Array[] = [u32be(schedule.classes.length)];

    for (let index = 0; index < schedule.classes.length; index += 1) {
        const resourceClass: PhloResourceClassV1 = schedule.classes[index];

        if (
            resourceClass.measurementRule.length !== 32 ||
            resourceClass.valuationRule.length !== 32
        ) {
            fail(PhloScheduleErrorMessage.FIELD_WIDTH);
        }

        classFields.push(
            encodeWireFields(
                [
                    resourceClass.identity,
                    resourceClass.measurementUnit,
                    resourceClass.measurementRule,
                    resourceClass.valuationRule,
                    u64be(resourceClass.weight),
                ],
                nestedLimits(limits.wire),
            ),
        );
    }

    if (schedule.compatibilityRule.length !== 32) {
        fail(PhloScheduleErrorMessage.FIELD_WIDTH);
    }

    return encodeWireFields(
        [
            PHLO_SCHEDULE_V1_DOMAIN,
            u64be(schedule.protocolVersion),
            schedule.network,
            schedule.shard,
            schedule.settlementAsset,
            schedule.settlementUnit,
            u8be(schedule.decimalScale),
            encodeWireFields(classFields, nestedLimits(limits.wire)),
            u64be(schedule.actualPrice),
            u64be(1),
            schedule.compatibilityRule,
        ],
        limits.wire,
    );
};

const decodeClasses = (
    input: Uint8Array,
    limits: PhloScheduleLimits,
): PhloResourceClassV1[] => {
    const fields: PhloWireDecoder = new PhloWireDecoder(
        input,
        nestedLimits(limits.wire),
    );
    const count: number = fixedUnsigned(fields, 4);

    if (count === 0) {
        fail(PhloScheduleErrorMessage.EMPTY_CLASSES);
    }

    if (count > limits.classes) {
        fail(PhloScheduleErrorMessage.CLASS_LIMIT);
    }

    const classes: PhloResourceClassV1[] = new Array(count);

    for (let index = 0; index < count; index += 1) {
        const record: PhloWireDecoder = new PhloWireDecoder(
            fields.bytes(),
            nestedLimits(limits.wire),
        );
        const identity: Uint8Array = record.bytes();
        const measurementUnit: Uint8Array = record.bytes();
        const measurementRule: Uint8Array = fixedField(record, 32);
        const valuationRule: Uint8Array = fixedField(record, 32);
        const weight: number = fixedUnsigned(record, 8);

        record.finish();

        if (identity.length === 0 || measurementUnit.length === 0) {
            fail(PhloScheduleErrorMessage.EMPTY_IDENTITY);
        }

        for (let prior = 0; prior < index; prior += 1) {
            if (bytesEqual(classes[prior].identity, identity)) {
                fail(PhloScheduleErrorMessage.DUPLICATE_CLASS);
            }
        }

        classes[index] = {
            identity: identity.slice(),
            measurementUnit: measurementUnit.slice(),
            measurementRule: measurementRule.slice(),
            valuationRule: valuationRule.slice(),
            weight,
        };
    }

    fields.finish();

    return classes;
};

export const decodeSchedule = (
    input: Uint8Array,
    limits: PhloScheduleLimits,
): PhloScheduleV1 => {
    const fields: PhloWireDecoder = new PhloWireDecoder(input, limits.wire);

    if (!bytesEqual(fields.bytes(), PHLO_SCHEDULE_V1_DOMAIN)) {
        fail(PhloScheduleErrorMessage.FORMAT_DOMAIN);
    }

    const protocolVersion: number = fixedUnsigned(fields, 8);
    const network: Uint8Array = fields.bytes().slice();
    const shard: Uint8Array = fields.bytes().slice();
    const settlementAsset: Uint8Array = fields.bytes().slice();
    const settlementUnit: Uint8Array = fields.bytes().slice();
    const decimalScale: number = fixedUnsigned(fields, 1);
    const classes: PhloResourceClassV1[] = decodeClasses(fields.bytes(), limits);
    const actualPrice: number = fixedUnsigned(fields, 8);
    const fee: Uint8Array = fixedField(fields, 8);

    if (!bytesEqual(fee, u64be(1))) {
        fail(PhloScheduleErrorMessage.FEE_POLICY);
    }

    const compatibilityRule: Uint8Array = fixedField(fields, 32).slice();

    fields.finish();

    const schedule: PhloScheduleV1 = {
        protocolVersion,
        network,
        shard,
        settlementAsset,
        settlementUnit,
        decimalScale,
        classes,
        actualPrice,
        compatibilityRule,
    };

    validateSchedule(schedule, limits);

    return schedule;
};

export const encodeGenesisPolicy = (policy: PhloGenesisPolicy): Uint8Array => {
    if (policy.offeredFundedV6Active && policy.schedule.protocolVersion !== 6) {
        fail(PhloScheduleErrorMessage.GENESIS_POLICY_ACTIVATION);
    }

    const fields: Uint8Array[] = [
        policy.offeredFundedV6Active
            ? PHLO_GENESIS_POLICY_V2_DOMAIN
            : PHLO_GENESIS_POLICY_V1_DOMAIN,
        policy.scheduleBytes,
    ];

    if (policy.offeredFundedV6Active) {
        fields.push(new Uint8Array([1]));
    }

    return encodeWireFields(fields, GENESIS_POLICY_LIMITS.wire);
};

export const decodeGenesisPolicy = (input: Uint8Array): PhloGenesisPolicy => {
    const wire: PhloWireDecoder = new PhloWireDecoder(
        input,
        GENESIS_POLICY_LIMITS.wire,
    );
    const domain: Uint8Array = wire.bytes();
    let offeredFundedV6Active: boolean = false;

    if (bytesEqual(domain, PHLO_GENESIS_POLICY_V2_DOMAIN)) {
        offeredFundedV6Active = true;
    } else if (!bytesEqual(domain, PHLO_GENESIS_POLICY_V1_DOMAIN)) {
        fail(PhloScheduleErrorMessage.FORMAT_DOMAIN);
    }

    const scheduleBytes: Uint8Array = wire.bytes().slice();

    if (
        offeredFundedV6Active &&
        !bytesEqual(wire.bytes(), new Uint8Array([1]))
    ) {
        fail(PhloScheduleErrorMessage.GENESIS_POLICY_ACTIVATION);
    }

    wire.finish();

    const schedule: PhloScheduleV1 = decodeSchedule(
        scheduleBytes,
        GENESIS_POLICY_LIMITS,
    );

    if (offeredFundedV6Active && schedule.protocolVersion !== 6) {
        fail(PhloScheduleErrorMessage.GENESIS_POLICY_ACTIVATION);
    }

    if (schedule.actualPrice !== 0) {
        fail(PhloScheduleErrorMessage.GENESIS_POLICY_PRICE);
    }

    const policy: PhloGenesisPolicy = {
        schedule,
        scheduleBytes,
        offeredFundedV6Active,
    };

    if (!bytesEqual(encodeGenesisPolicy(policy), input)) {
        fail(PhloScheduleErrorMessage.GENESIS_POLICY_CANONICAL);
    }

    return policy;
};

// Decodes the hexadecimal `resource-policy` value of a genesis configuration.
export const decodeResourcePolicyHex = (hex: string): PhloGenesisPolicy =>
    decodeGenesisPolicy(hexToBytes(hex));
