// Canonical protobuf encoding of the messages that an owner-direct offer
// writes (f1r3node-rust fe6cce76e, models/src/main/protobuf/CasperMessage.proto
// and RhoTypes.proto).
//
// The node decodes the offer and encodes it again with prost, and it refuses
// the offer when the bytes differ. Prost writes fields in tag order and omits
// a scalar or string or bytes field that holds its default value. A set
// message field and a set proto3 `optional` field are always written.

import {
    MAX_SAFE_INTEGER,
    OwnerOfferError,
    concatBytes,
    requireSafeUnsigned,
    utf8Bytes,
} from "./bytes";

const WIRE_TYPE_VARINT: number = 0;
const WIRE_TYPE_LENGTH_DELIMITED: number = 2;

export const varintBytes = (value: number): Uint8Array => {
    requireSafeUnsigned(value, "a protobuf varint");

    const output: number[] = [];
    let remaining: number = value;

    while (remaining >= 0x80) {
        output.push((remaining % 0x80) | 0x80);
        remaining = Math.floor(remaining / 0x80);
    }

    output.push(remaining);

    return new Uint8Array(output);
};

export class ProtoWriter {
    private readonly parts: Uint8Array[] = [];
    private lastField: number = 0;

    // Writes a non-negative int64, uint32 or enum field. Zero is omitted.
    public varint(field: number, value: number): this {
        if (value === 0) {
            return this;
        }

        this.key(field, WIRE_TYPE_VARINT);
        this.parts.push(varintBytes(value));

        return this;
    }

    // Writes a string field. The empty string is omitted.
    public string(field: number, value: string): this {
        if (value.length === 0) {
            return this;
        }

        return this.lengthDelimited(field, utf8Bytes(value));
    }

    // Writes a bytes field. Empty bytes are omitted.
    public bytes(field: number, value: Uint8Array): this {
        if (value.length === 0) {
            return this;
        }

        return this.lengthDelimited(field, value);
    }

    // Writes a set message field or a set proto3 `optional` bytes field,
    // even when its encoding is empty.
    public present(field: number, value: Uint8Array): this {
        return this.lengthDelimited(field, value);
    }

    public finish(): Uint8Array {
        return concatBytes(this.parts);
    }

    private lengthDelimited(field: number, value: Uint8Array): this {
        this.key(field, WIRE_TYPE_LENGTH_DELIMITED);
        this.parts.push(varintBytes(value.length), value);

        return this;
    }

    private key(field: number, wireType: number): void {
        if (field < this.lastField) {
            throw new OwnerOfferError(
                "protobuf fields must be written in tag order",
            );
        }

        this.lastField = field;
        this.parts.push(varintBytes(field * 8 + wireType));
    }
}

// `SignatureSchemeV61::SIGNATURE_SCHEME_V61_SECP256K1`.
export const SIGNATURE_SCHEME_V61_SECP256K1: number = 1;

// The location of a ground or quote signature: the `Par` of
// `SignatureChannel::from_sig`, which holds one `GPrivate` whose id is the
// Blake2b-256 hash of the signature bytes.
export const encodePrivateNamePar = (id: Uint8Array): Uint8Array => {
    const gPrivate: Uint8Array = new ProtoWriter().bytes(1, id).finish();
    const gUnforgeable: Uint8Array = new ProtoWriter()
        .present(1, gPrivate)
        .finish();

    return new ProtoWriter().present(7, gUnforgeable).finish();
};

// The body fields of an offered `DeployDataProto`, as
// `OfferedFundedDeploy::to_message` sets them.
export interface OfferedDeployProtoBody {
    term: string;
    timestamp: number;
    phloPrice: number;
    phloLimit: number;
    validAfterBlockNumber: number;
    shardId: string;
    language: string;
    expirationTimestamp: number;
}

export interface OfferedDeployProtoAuthorization {
    deployId: Uint8Array;
    formatVersion: number;
    publicKey: Uint8Array;
    presenceBitmap: Uint8Array;
    signature: Uint8Array;
}

const writeBody = (
    writer: ProtoWriter,
    body: OfferedDeployProtoBody,
): ProtoWriter =>
    writer
        .string(2, body.term)
        .varint(3, body.timestamp)
        .varint(7, body.phloPrice)
        .varint(8, body.phloLimit)
        .varint(10, body.validAfterBlockNumber)
        .string(11, body.shardId)
        .string(12, body.language)
        .varint(13, body.expirationTimestamp);

const varintLength = (value: number): number => varintBytes(value).length;

// The length of an int64 field as prost counts it. A negative value takes 10
// bytes (two's complement), so the size check below can run before the body
// intent refuses the negative value, as in `OfferedFundedDeploy::new`.
const int64FieldLength = (field: number, value: number): number => {
    if (value === 0) {
        return 0;
    }

    if (Math.floor(value) !== value || value < -MAX_SAFE_INTEGER) {
        throw new OwnerOfferError("an int64 field must be a safe integer");
    }

    return varintLength(field * 8) + (value < 0 ? 10 : varintLength(value));
};

const stringFieldLength = (field: number, value: string): number => {
    const length: number = utf8Bytes(value).length;

    return length === 0
        ? 0
        : varintLength(field * 8 + 2) + varintLength(length) + length;
};

// `proto.encoded_len()` of the body proto plus
// `prost::encoding::bytes::encoded_len(21, funding_intent)`, which
// `OfferedFundedDeploy::new` compares with the deploy byte limit.
export const offeredBodyEncodedLength = (
    body: OfferedDeployProtoBody,
    fundingIntent: Uint8Array,
): number =>
    stringFieldLength(2, body.term) +
    int64FieldLength(3, body.timestamp) +
    int64FieldLength(7, body.phloPrice) +
    int64FieldLength(8, body.phloLimit) +
    int64FieldLength(10, body.validAfterBlockNumber) +
    stringFieldLength(11, body.shardId) +
    stringFieldLength(12, body.language) +
    int64FieldLength(13, body.expirationTimestamp) +
    varintLength(21 * 8 + 2) +
    varintLength(fundingIntent.length) +
    fundingIntent.length;

// `OfferedFundedDeploy::to_proto` for an envelope with one signer under an
// `AllOf` policy.
export const encodeOfferedDeployProto = (
    body: OfferedDeployProtoBody,
    fundingIntent: Uint8Array,
    authorization: OfferedDeployProtoAuthorization,
): Uint8Array => {
    const principal: Uint8Array = new ProtoWriter()
        .varint(1, SIGNATURE_SCHEME_V61_SECP256K1)
        .bytes(2, authorization.publicKey)
        .finish();
    const allOf: Uint8Array = new ProtoWriter().present(1, principal).finish();
    const policy: Uint8Array = new ProtoWriter().present(1, allOf).finish();
    const witness: Uint8Array = new ProtoWriter()
        .varint(1, 0)
        .bytes(2, authorization.signature)
        .finish();
    const deployAuthorization: Uint8Array = new ProtoWriter()
        .varint(1, authorization.formatVersion)
        .present(2, policy)
        .bytes(3, authorization.presenceBitmap)
        .present(4, witness)
        .finish();

    return writeBody(new ProtoWriter(), body)
        .bytes(19, authorization.deployId)
        .present(20, deployAuthorization)
        .present(21, fundingIntent)
        .finish();
};
