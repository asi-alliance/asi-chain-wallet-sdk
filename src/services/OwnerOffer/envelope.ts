// Port of the protocol-v6 envelope of an offered-funded deploy
// (f1r3node-rust fe6cce76e):
// - `DeployData::envelope_intent_v61` (models/src/rust/cost_deploy_data.rs)
// - `OfferedFundedDeploy::new` and `encode_signing_payload`
//   (models/src/rust/signed_phlo_deploy.rs and signed_phlo_deploy/offered.rs)
// - the envelope commitment, the signing hash and the canonical key and
//   signature checks (crypto/src/rust/signatures/signed.rs)

import {
    OwnerOfferError,
    asciiBytes,
    compareBytes,
    concatBytes,
    hexToBytes,
    isSafeUnsigned,
    u16be,
    u32be,
    u64be,
    utf8Bytes,
} from "./bytes";
import { PhloWireLimits, encodeWireFields } from "./wire";

export type Blake2b256 = (data: Uint8Array) => Uint8Array;

export const OFFERED_FUNDED_DEPLOY_AUTHORIZATION_VERSION: number = 0x00060003;
export const OFFERED_FUNDED_DEPLOY_INTENT_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:offered-funded-deploy-intent:v1",
);
export const ENVELOPE_COMMITMENT_DOMAIN: Uint8Array = asciiBytes(
    "f1r3fly:casper:deploy-envelope:v6.1",
);
export const ENVELOPE_SIGNATURE_DOMAIN: Uint8Array = asciiBytes(
    "f1r3fly:casper:deploy-envelope-signature:v6.1",
);
export const ENVELOPE_PROTOCOL_VERSION: number = 6;
// `envelope_scheme_id("secp256k1")`.
export const SECP256K1_SCHEME_ID: number = 1;
export const DEPLOY_LANGUAGE: string = "rholang";

// The secp256k1 group order n and n / 2 (rounded down), big-endian.
const SECP256K1_ORDER: Uint8Array = hexToBytes(
    "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
);
const SECP256K1_HALF_ORDER: Uint8Array = hexToBytes(
    "7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0",
);

// The deploy body of an owner-direct offer. The language is always
// `rholang` and an owner-direct offer has no authority presentations.
export interface OwnerOfferBody {
    term: string;
    timestamp: number;
    validAfterBlockNumber: number;
    shardId: string;
    // Omit the field (or pass 0) for a deploy without expiration.
    expirationTimestamp?: number;
}

const fail = (message: string): never => {
    throw new OwnerOfferError(message);
};

const intentField = (bytes: Uint8Array): Uint8Array =>
    concatBytes([u64be(bytes.length), bytes]);

// `DeployData::envelope_intent_v61` for a `rholang` body without authority
// presentations.
export const encodeBodyIntent = (body: OwnerOfferBody): Uint8Array => {
    if (!isSafeUnsigned(body.timestamp)) {
        fail("protocol-v6 deploy timestamp must be nonnegative");
    }

    if (!isSafeUnsigned(body.validAfterBlockNumber)) {
        fail("protocol-v6 valid-after block must be nonnegative");
    }

    if (body.shardId.length === 0) {
        fail("protocol-v6 shard ID must be nonempty");
    }

    const expiration: number = body.expirationTimestamp ?? 0;
    let expirationBytes: Uint8Array = new Uint8Array([0]);

    if (expiration !== 0) {
        if (!isSafeUnsigned(expiration)) {
            fail("protocol-v6 expiration timestamp must be positive");
        }

        expirationBytes = concatBytes([new Uint8Array([1]), u64be(expiration)]);
    }

    return concatBytes([
        u16be(1),
        new Uint8Array([1]),
        intentField(utf8Bytes(body.term)),
        u64be(body.timestamp),
        u64be(body.validAfterBlockNumber),
        intentField(utf8Bytes(body.shardId)),
        expirationBytes,
        u32be(0),
    ]);
};

// `encode_signing_payload([0, 3], ...)` of `OfferedFundedDeploy::new`.
export const encodeOfferedSigningPayload = (
    bodyIntent: Uint8Array,
    fundingIntent: Uint8Array,
    phloLimit: number,
    phloPrice: number,
    limits: PhloWireLimits,
): Uint8Array => {
    const prefix: Uint8Array = new Uint8Array([0, 3]);

    if (limits.totalBytes < prefix.length) {
        fail("funded signing payload exceeds its byte limit");
    }

    const fields: Uint8Array = encodeWireFields(
        [
            OFFERED_FUNDED_DEPLOY_INTENT_DOMAIN,
            u32be(OFFERED_FUNDED_DEPLOY_AUTHORIZATION_VERSION),
            bodyIntent,
            fundingIntent,
            u64be(phloLimit),
            u64be(phloPrice),
        ],
        {
            totalBytes: limits.totalBytes - prefix.length,
            fieldBytes: limits.fieldBytes,
        },
    );

    return concatBytes([prefix, fields]);
};

// `canonical_envelope_public_key`: protocol v6 takes only the 65-byte
// uncompressed SEC1 form. The node also checks that the point is on the curve.
export const requireCanonicalPublicKey = (publicKey: Uint8Array): void => {
    if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
        fail(
            "protocol-v6 signer has a non-canonical public key: a 65-byte uncompressed secp256k1 key is required",
        );
    }
};

// `principal_bytes` for a secp256k1 signer.
export const encodePrincipal = (publicKey: Uint8Array): Uint8Array => {
    requireCanonicalPublicKey(publicKey);

    return concatBytes([
        u16be(SECP256K1_SCHEME_ID),
        u32be(publicKey.length),
        publicKey,
    ]);
};

// The presence bitmap of one signer that signs.
export const SINGLE_SIGNER_PRESENCE_BITMAP: Uint8Array = new Uint8Array([1]);

// `Cosigned::envelope_commitment_for_canonical` for one signer under an
// `AllOf` policy (threshold 1 of 1). The commitment is the deploy ID.
export const envelopeCommitment = (
    signingPayload: Uint8Array,
    publicKey: Uint8Array,
    blake2b256: Blake2b256,
): Uint8Array => {
    const policy: Uint8Array = concatBytes([
        new Uint8Array([1]),
        u32be(1),
        encodePrincipal(publicKey),
    ]);

    return blake2b256(
        concatBytes([
            intentField(ENVELOPE_COMMITMENT_DOMAIN),
            u16be(ENVELOPE_PROTOCOL_VERSION),
            intentField(signingPayload),
            intentField(policy),
            u32be(SINGLE_SIGNER_PRESENCE_BITMAP.length),
            SINGLE_SIGNER_PRESENCE_BITMAP,
        ]),
    );
};

// `Cosigned::envelope_signature_hash_for_commitment` for `secp256k1`: the
// signer signs this 32-byte hash directly (prehash signing).
export const envelopeSigningHash = (
    commitment: Uint8Array,
    blake2b256: Blake2b256,
): Uint8Array =>
    blake2b256(
        concatBytes([
            intentField(ENVELOPE_SIGNATURE_DOMAIN),
            u16be(ENVELOPE_PROTOCOL_VERSION),
            u16be(SECP256K1_SCHEME_ID),
            commitment,
        ]),
    );

// Reads one DER INTEGER at `offset` and returns its 32-byte big-endian value
// and the next offset, or null when the encoding is not minimal or the value
// is not in [1, n - 1].
const readDerScalar = (
    signature: Uint8Array,
    offset: number,
): { value: Uint8Array; next: number } | null => {
    if (offset + 2 > signature.length || signature[offset] !== 0x02) {
        return null;
    }

    const length: number = signature[offset + 1];
    const start: number = offset + 2;
    const end: number = start + length;

    if (length === 0 || length > 33 || end > signature.length) {
        return null;
    }

    if (signature[start] >= 0x80) {
        return null;
    }

    if (
        signature[start] === 0 &&
        (length === 1 || signature[start + 1] < 0x80)
    ) {
        return null;
    }

    const magnitude: Uint8Array =
        signature[start] === 0
            ? signature.subarray(start + 1, end)
            : signature.subarray(start, end);

    if (magnitude.length > 32) {
        return null;
    }

    const value: Uint8Array = new Uint8Array(32);

    value.set(magnitude, 32 - magnitude.length);

    if (
        compareBytes(value, new Uint8Array(32)) === 0 ||
        compareBytes(value, SECP256K1_ORDER) >= 0
    ) {
        return null;
    }

    return { value, next: end };
};

// `canonical_envelope_signature` for scheme 1: a strict, minimal DER
// signature whose `s` is at most n / 2 (low-S).
export const isCanonicalLowSDerSignature = (signature: Uint8Array): boolean => {
    if (
        signature.length < 8 ||
        signature[0] !== 0x30 ||
        signature[1] >= 0x80 ||
        signature[1] !== signature.length - 2
    ) {
        return false;
    }

    const r = readDerScalar(signature, 2);

    if (r === null) {
        return false;
    }

    const s = readDerScalar(signature, r.next);

    if (s === null || s.next !== signature.length) {
        return false;
    }

    return compareBytes(s.value, SECP256K1_HALF_ORDER) <= 0;
};
