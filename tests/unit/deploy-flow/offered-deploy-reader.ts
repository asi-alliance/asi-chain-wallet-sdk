// Test helpers that read an offered deploy without the encoder under test:
// an independent protobuf reader, a phlo-wire field splitter and the
// envelope hashes written out from the node's definitions (f1r3node-rust
// fe6cce76e, crypto/src/rust/signatures/signed.rs).

import assert from "node:assert/strict";
import blakejs from "blakejs";

const { blake2b } = blakejs;

export interface IProtoField {
    field: number;
    varint?: bigint;
    bytes?: Uint8Array;
}

export interface IOfferedDeploy {
    fieldOrder: number[];
    term: string;
    timestamp: bigint;
    phloPrice: bigint;
    phloLimit: bigint;
    validAfterBlockNumber: bigint;
    shardId: string;
    language: string;
    expirationTimestamp: bigint;
    deployId: Uint8Array;
    formatVersion: bigint;
    scheme: bigint;
    publicKey: Uint8Array;
    presenceBitmap: Uint8Array;
    witnessFieldOrder: number[];
    signature: Uint8Array;
    fundingIntent: Uint8Array;
}

export const blake2b256 = (data: Uint8Array): Uint8Array =>
    blake2b(data, undefined, 32);

export const textBytes = (value: string): Uint8Array =>
    new TextEncoder().encode(value);

export const ascii = (bytes: Uint8Array): string =>
    new TextDecoder().decode(bytes);

export const hex = (bytes: Uint8Array): string =>
    Buffer.from(bytes).toString("hex");

export const concat = (parts: Uint8Array[]): Uint8Array => {
    const output: Uint8Array = new Uint8Array(
        parts.reduce((total, part) => total + part.length, 0),
    );
    let offset: number = 0;

    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }

    return output;
};

export const beBytes = (value: bigint, width: number): Uint8Array => {
    const output: Uint8Array = new Uint8Array(width);
    let remaining: bigint = value;

    for (let index = width - 1; index >= 0; index -= 1) {
        output[index] = Number(remaining & 0xffn);
        remaining >>= 8n;
    }

    assert.equal(remaining, 0n, "value fits its width");

    return output;
};

export const lengthField = (bytes: Uint8Array): Uint8Array =>
    concat([beBytes(BigInt(bytes.length), 8), bytes]);

export const readProto = (input: Uint8Array): IProtoField[] => {
    const fields: IProtoField[] = [];
    let position: number = 0;

    const readVarint = (): bigint => {
        let value: bigint = 0n;
        let shift: bigint = 0n;

        for (;;) {
            const byte: number | undefined = input[position];

            assert.notEqual(byte, undefined, "varint ends early");
            position += 1;
            value |= BigInt(byte! & 0x7f) << shift;

            if ((byte! & 0x80) === 0) {
                return value;
            }

            shift += 7n;
        }
    };

    while (position < input.length) {
        const key: bigint = readVarint();
        const fieldNumber: number = Number(key >> 3n);
        const wireType: number = Number(key & 7n);

        if (wireType === 0) {
            fields.push({ field: fieldNumber, varint: readVarint() });
        } else if (wireType === 2) {
            const length: number = Number(readVarint());

            assert.ok(position + length <= input.length, "field ends early");
            fields.push({
                field: fieldNumber,
                bytes: input.slice(position, position + length),
            });
            position += length;
        } else {
            assert.fail(`unexpected wire type ${wireType}`);
        }
    }

    return fields;
};

export const only = (fields: IProtoField[], fieldNumber: number): IProtoField => {
    const matches: IProtoField[] = fields.filter(
        (entry) => entry.field === fieldNumber,
    );

    assert.equal(matches.length, 1, `field ${fieldNumber} appears once`);

    return matches[0];
};

const varintOf = (fields: IProtoField[], fieldNumber: number): bigint =>
    fields.some((entry) => entry.field === fieldNumber)
        ? only(fields, fieldNumber).varint!
        : 0n;

// Splits a phlo-wire record into its fields: each field is a big-endian u64
// length and then that many bytes.
export const wireFields = (input: Uint8Array): Uint8Array[] => {
    const output: Uint8Array[] = [];
    let position: number = 0;

    while (position < input.length) {
        assert.ok(position + 8 <= input.length, "wire field header ends early");

        const length: number = Number(
            Buffer.from(input.subarray(position, position + 8)).readBigUInt64BE(),
        );

        assert.ok(position + 8 + length <= input.length, "wire field ends early");
        output.push(input.slice(position + 8, position + 8 + length));
        position += 8 + length;
    }

    return output;
};

export const readOfferedDeploy = (proto: Uint8Array): IOfferedDeploy => {
    const fields: IProtoField[] = readProto(proto);
    const authorization: IProtoField[] = readProto(only(fields, 20).bytes!);
    const policy: IProtoField[] = readProto(only(authorization, 2).bytes!);
    const allOf: IProtoField[] = readProto(only(policy, 1).bytes!);
    const principal: IProtoField[] = readProto(only(allOf, 1).bytes!);
    const witness: IProtoField[] = readProto(only(authorization, 4).bytes!);

    return {
        fieldOrder: fields.map((entry) => entry.field),
        term: ascii(only(fields, 2).bytes!),
        timestamp: varintOf(fields, 3),
        phloPrice: varintOf(fields, 7),
        phloLimit: varintOf(fields, 8),
        validAfterBlockNumber: varintOf(fields, 10),
        shardId: ascii(only(fields, 11).bytes!),
        language: ascii(only(fields, 12).bytes!),
        expirationTimestamp: varintOf(fields, 13),
        deployId: only(fields, 19).bytes!,
        formatVersion: varintOf(authorization, 1),
        scheme: varintOf(principal, 1),
        publicKey: only(principal, 2).bytes!,
        presenceBitmap: only(authorization, 3).bytes!,
        witnessFieldOrder: witness.map((entry) => entry.field),
        signature: only(witness, 2).bytes!,
        fundingIntent: only(fields, 21).bytes!,
    };
};

// `principal_bytes` of a secp256k1 signer.
export const principalOf = (publicKey: Uint8Array): Uint8Array =>
    concat([beBytes(1n, 2), beBytes(BigInt(publicKey.length), 4), publicKey]);

// `envelope_commitment_for_canonical` for one signer under an AllOf policy.
export const commitmentOf = (
    signingPayload: Uint8Array,
    publicKey: Uint8Array,
): Uint8Array =>
    blake2b256(
        concat([
            lengthField(textBytes("f1r3fly:casper:deploy-envelope:v6.1")),
            beBytes(6n, 2),
            lengthField(signingPayload),
            lengthField(
                concat([new Uint8Array([1]), beBytes(1n, 4), principalOf(publicKey)]),
            ),
            beBytes(1n, 4),
            new Uint8Array([1]),
        ]),
    );

// `envelope_signature_hash_for_commitment` for secp256k1.
export const signingHashOf = (deployId: Uint8Array): Uint8Array =>
    blake2b256(
        concat([
            lengthField(textBytes("f1r3fly:casper:deploy-envelope-signature:v6.1")),
            beBytes(6n, 2),
            beBytes(1n, 2),
            deployId,
        ]),
    );

// Rebuilds the signing payload of an offered deploy from its proto fields
// (`OfferedFundedDeploy::new` and `DeployData::envelope_intent_v61`), checks
// that the deploy ID commits to it and returns the signing hash.
export const envelopeSigningHashOf = (
    proto: Uint8Array,
): { deploy: IOfferedDeploy; signingHash: Uint8Array } => {
    const deploy: IOfferedDeploy = readOfferedDeploy(proto);

    assert.equal(deploy.language, "rholang");

    const expiration: Uint8Array =
        deploy.expirationTimestamp === 0n
            ? new Uint8Array([0])
            : concat([new Uint8Array([1]), beBytes(deploy.expirationTimestamp, 8)]);
    const bodyIntent: Uint8Array = concat([
        beBytes(1n, 2),
        new Uint8Array([1]),
        lengthField(textBytes(deploy.term)),
        beBytes(deploy.timestamp, 8),
        beBytes(deploy.validAfterBlockNumber, 8),
        lengthField(textBytes(deploy.shardId)),
        expiration,
        beBytes(0n, 4),
    ]);
    const signingPayload: Uint8Array = concat([
        new Uint8Array([0, 3]),
        lengthField(textBytes("f1r3node:offered-funded-deploy-intent:v1")),
        lengthField(beBytes(0x00060003n, 4)),
        lengthField(bodyIntent),
        lengthField(deploy.fundingIntent),
        lengthField(beBytes(deploy.phloLimit, 8)),
        lengthField(beBytes(deploy.phloPrice, 8)),
    ]);
    const commitment: Uint8Array = commitmentOf(signingPayload, deploy.publicKey);

    assert.equal(hex(deploy.deployId), hex(commitment), "the deploy ID commits to the proto");

    return { deploy, signingHash: signingHashOf(commitment) };
};

// The signed schedule of an offer: the one permitted schedule of its
// funding controls.
export const signedScheduleOf = (fundingIntent: Uint8Array): Uint8Array => {
    const [, base] = wireFields(fundingIntent);
    const [, controls] = wireFields(base);
    const [, , , , schedules] = wireFields(controls);
    const [count, schedule] = wireFields(schedules);

    assert.equal(hex(count), "00000001");

    return schedule;
};
