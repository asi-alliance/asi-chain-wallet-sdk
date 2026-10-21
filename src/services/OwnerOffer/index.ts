// The owner-direct offer of a client: a TypeScript port of
// `casper::rust::util::rholang::costacc::owner_offer::owner_direct_offer`
// (f1r3node-rust fe6cce76e8a0766039342eac644b0dbbecf5bae1).
//
// A protocol-6 node accepts only offered-funded deploys. An owner-direct
// offer lets the signer's own vault fund every class of the signer's own
// principal lane, under the genesis schedule of the shard at the signed
// price. The REV ceiling is phloLimit * phloPrice plus the fixed fee of 1.
// The source caps and the total exposure equal that ceiling.
//
// This directory is self-contained so that an ES5 project such as the wallet
// can import it through the package API:
// - it imports only its own files;
// - it uses no bigint values, so it compiles for an ES5 target;
// - hashing and signing are injected functions.

import {
    OwnerOfferError,
    asciiBytes,
    bytesToBase58,
    bytesToBase64,
    bytesToHex,
    concatBytes,
    requireSafeUnsigned,
    u128MultiplyAdd,
    u16be,
    u32be,
} from "./bytes";
import {
    DEPLOY_LANGUAGE,
    OFFERED_FUNDED_DEPLOY_AUTHORIZATION_VERSION,
    OwnerOfferBody,
    SINGLE_SIGNER_PRESENCE_BITMAP,
    encodeBodyIntent,
    encodeOfferedSigningPayload,
    envelopeCommitment,
    envelopeSigningHash,
    isCanonicalLowSDerSignature,
    requireCanonicalPublicKey,
} from "./envelope";
import {
    PhloFundingIntentLimits,
    PhloFundingIntentV1,
    PhloResourceKeyV1,
    PhloSourcePolicyV1,
    createSourcePolicy,
    encodeFundingIntentV2NoConversion,
} from "./funding";
import {
    OfferedDeployProtoBody,
    encodeOfferedDeployProto,
    encodePrivateNamePar,
    offeredBodyEncodedLength,
} from "./protobuf";
import {
    GENESIS_POLICY_LIMITS,
    PhloScheduleV1,
    encodeSchedule,
} from "./schedule";
import { PhloWireLimits } from "./wire";

export * from "./bytes";
export * from "./envelope";
export * from "./funding";
export * from "./protobuf";
export * from "./schedule";
export * from "./wire";

// The hash functions that the offer needs. Each returns 32 bytes.
export interface OwnerOfferHashing {
    blake2b256: (data: Uint8Array) => Uint8Array;
    keccak256: (data: Uint8Array) => Uint8Array;
}

// The signer of an owner-direct offer. `sign` signs the 32-byte signing hash
// directly (prehash ECDSA over secp256k1) and returns a strict DER
// signature with a low S value.
export interface OwnerOfferSigner {
    publicKey: Uint8Array;
    sign: (signingHash: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}

export interface OwnerOfferRequest {
    body: OwnerOfferBody;
    phloLimit: number;
    phloPrice: number;
    // The schedule of the shard's genesis policy. Its price is replaced by
    // `phloPrice`.
    genesisSchedule: PhloScheduleV1;
}

export interface OwnerDirectOffer {
    // The canonical `DeployDataProto` bytes and their standard base64 form,
    // the body of `POST /api/deploy/offered`.
    deployDataProto: Uint8Array;
    deployDataProtoBase64: string;
    // The 32-byte envelope commitment, which is the deploy ID.
    deployId: Uint8Array;
    deployIdHex: string;
    signingHash: Uint8Array;
    signature: Uint8Array;
    fundingIntent: Uint8Array;
    signingPayload: Uint8Array;
}

// `models::rust::cost_protocol_limits::offered_funded_v6_limits()` at
// fe6cce76e: the parts that an owner-direct offer uses.
export const OFFERED_FUNDED_V6_DEPLOY_BYTES: number = 1048576;
export const OFFERED_FUNDED_V6_SIGNING_LIMITS: PhloWireLimits = {
    totalBytes: 524288,
    fieldBytes: 262144,
};
export const OFFERED_FUNDED_V6_FUNDING_LIMITS: PhloFundingIntentLimits = {
    wire: { totalBytes: 262144, fieldBytes: 131072 },
    controls: {
        wire: { totalBytes: 65536, fieldBytes: 32768 },
        owners: 64,
        schedules: 4,
        totalClasses: 32,
    },
    sources: 64,
    resourcePermissions: 1024,
    authorityNodes: 4096,
};

// `casper::rust::util::rholang::acceptance::FIXED_FEE_REV`.
export const FIXED_FEE_REV: number = 1;

const SYSTEM_VAULT_CUSTODY_DOMAIN: Uint8Array = asciiBytes(
    "f1r3node:system-vault-custody:v1",
);
// `vault_address::COIN_ID` and `vault_address::VERSION`.
const VAULT_ADDRESS_PREFIX: Uint8Array = new Uint8Array([0, 0, 0, 0]);
const VAULT_ADDRESS_CHECKSUM_LENGTH: number = 4;

const invalidOffer = (message: string): OwnerOfferError =>
    new OwnerOfferError(`owner-direct offer: ${message}`);

const withOfferContext = <T>(build: () => T): T => {
    try {
        return build();
    } catch (error) {
        if (
            error instanceof OwnerOfferError &&
            error.message.indexOf("owner-direct offer: ") !== 0
        ) {
            throw invalidOffer(error.message);
        }

        throw error;
    }
};

const requireHash = (hash: Uint8Array, name: string): Uint8Array => {
    if (!(hash instanceof Uint8Array) || hash.length !== 32) {
        throw invalidOffer(`${name} must return 32 bytes`);
    }

    return hash;
};

// `accounting::principal_ground_v61`: the ground bytes of key family 1.
export const principalGroundV61 = (publicKey: Uint8Array): Uint8Array =>
    concatBytes([u16be(1), u32be(publicKey.length), publicKey]);

// `VaultAddress::from_public_key(pk).to_base58()`.
export const vaultAddressOfPublicKey = (
    publicKey: Uint8Array,
    hashing: OwnerOfferHashing,
): string => {
    requireCanonicalPublicKey(publicKey);

    const ethAddress: Uint8Array = requireHash(
        hashing.keccak256(publicKey.subarray(1)),
        "keccak256",
    ).subarray(12);
    const keyHash: Uint8Array = requireHash(
        hashing.keccak256(ethAddress),
        "keccak256",
    );
    const payload: Uint8Array = concatBytes([VAULT_ADDRESS_PREFIX, keyHash]);
    const checksum: Uint8Array = requireHash(
        hashing.blake2b256(payload),
        "blake2b256",
    ).subarray(0, VAULT_ADDRESS_CHECKSUM_LENGTH);

    return bytesToBase58(concatBytes([payload, checksum]));
};

// `vault_payer(...).custody_key` for the ground signature of a secp256k1 key:
// the Blake2b-256 hash of the custody domain and the base58 vault address.
export const vaultCustodyKey = (
    publicKey: Uint8Array,
    hashing: OwnerOfferHashing,
): Uint8Array =>
    requireHash(
        hashing.blake2b256(
            concatBytes([
                SYSTEM_VAULT_CUSTODY_DOMAIN,
                asciiBytes(vaultAddressOfPublicKey(publicKey, hashing)),
            ]),
        ),
        "blake2b256",
    );

// An offer before its signature. The signer signs `signingHash`, and
// `finishOwnerDirectOffer` adds the signature.
export interface PreparedOwnerDirectOffer {
    proto: OfferedDeployProtoBody;
    publicKey: Uint8Array;
    fundingIntent: Uint8Array;
    signingPayload: Uint8Array;
    deployId: Uint8Array;
    signingHash: Uint8Array;
}

// Builds everything of the offer except its signature. The steps follow
// `owner_direct_offer` in order, so that an invalid input fails at the same
// step and with the same message as the Rust builder.
export const prepareOwnerDirectOffer = (
    request: OwnerOfferRequest,
    publicKey: Uint8Array,
    hashing: OwnerOfferHashing,
): PreparedOwnerDirectOffer =>
    withOfferContext((): PreparedOwnerDirectOffer => {
        const phloLimit: number = requireSafeUnsigned(
            request.phloLimit,
            "the phlo limit",
        );
        const phloPrice: number = requireSafeUnsigned(
            request.phloPrice,
            "the phlo price",
        );
        const limits: PhloFundingIntentLimits = OFFERED_FUNDED_V6_FUNDING_LIMITS;

        requireCanonicalPublicKey(publicKey);

        const ground: Uint8Array = principalGroundV61(publicKey);
        const custody: Uint8Array = vaultCustodyKey(publicKey, hashing);
        const schedule: PhloScheduleV1 = {
            protocolVersion: request.genesisSchedule.protocolVersion,
            network: request.genesisSchedule.network,
            shard: request.genesisSchedule.shard,
            settlementAsset: request.genesisSchedule.settlementAsset,
            settlementUnit: request.genesisSchedule.settlementUnit,
            decimalScale: request.genesisSchedule.decimalScale,
            classes: request.genesisSchedule.classes,
            actualPrice: phloPrice,
            compatibilityRule: request.genesisSchedule.compatibilityRule,
        };
        const acquisitionTerms: Uint8Array = encodeSchedule(
            schedule,
            GENESIS_POLICY_LIMITS,
        );
        const location: Uint8Array = encodePrivateNamePar(
            requireHash(hashing.blake2b256(ground), "blake2b256"),
        );
        const ceiling: Uint8Array = u128MultiplyAdd(
            phloLimit,
            phloPrice,
            FIXED_FEE_REV,
        );

        for (let index = 0; index < 8; index += 1) {
            if (ceiling[index] !== 0) {
                throw invalidOffer("the REV ceiling exceeds a source cap");
            }
        }

        const sourceCap: Uint8Array = ceiling.slice(8);
        const permissions: PhloResourceKeyV1[] = new Array(
            schedule.classes.length,
        );

        for (
            let classIndex = 0;
            classIndex < schedule.classes.length;
            classIndex += 1
        ) {
            // `PhloResource::wire_key` with one resource entry, 4096
            // authority nodes and `field_bytes` key bytes.
            if (
                location.length + acquisitionTerms.length + ground.length >
                limits.wire.fieldBytes
            ) {
                throw invalidOffer(
                    "phlo execution witness exceeds the key-byte limit",
                );
            }

            permissions[classIndex] = {
                location,
                classIndex,
                acquisitionTerms,
                authority: [{ kind: "ground", bytes: ground }],
            };
        }

        const source: PhloSourcePolicyV1 = createSourcePolicy(
            custody,
            sourceCap,
            sourceCap,
            true,
            permissions,
            {
                wire: limits.wire,
                resourcePermissions: schedule.classes.length,
                authorityNodes: limits.authorityNodes,
            },
        );
        const base: PhloFundingIntentV1 = {
            controls: {
                limit: phloLimit,
                priceCeiling: phloPrice,
                requiredOwnerCeilings: [phloPrice],
                permittedSchedules: [schedule],
            },
            scheduleCommitment: requireHash(
                hashing.blake2b256(acquisitionTerms),
                "blake2b256",
            ),
            totalExposure: ceiling,
            sources: [source],
        };
        const fundingIntent: Uint8Array = encodeFundingIntentV2NoConversion(
            base,
            {
                wire: limits.wire,
                base: limits,
                grantUses: limits.wire.totalBytes / 8,
                grantIdBytes: limits.wire.fieldBytes,
                quoteEvidenceBytes: limits.wire.fieldBytes,
            },
        );
        const proto: OfferedDeployProtoBody = {
            term: request.body.term,
            timestamp: request.body.timestamp,
            phloPrice,
            phloLimit,
            validAfterBlockNumber: request.body.validAfterBlockNumber,
            shardId: request.body.shardId,
            language: DEPLOY_LANGUAGE,
            expirationTimestamp: request.body.expirationTimestamp ?? 0,
        };

        // `OfferedFundedDeploy::new`.
        if (
            offeredBodyEncodedLength(proto, fundingIntent) >
            OFFERED_FUNDED_V6_DEPLOY_BYTES
        ) {
            throw invalidOffer("funded deploy exceeds its byte limit");
        }

        const signingPayload: Uint8Array = encodeOfferedSigningPayload(
            encodeBodyIntent(request.body),
            fundingIntent,
            phloLimit,
            phloPrice,
            OFFERED_FUNDED_V6_SIGNING_LIMITS,
        );
        const deployId: Uint8Array = requireHash(
            envelopeCommitment(signingPayload, publicKey, hashing.blake2b256),
            "blake2b256",
        );
        const signingHash: Uint8Array = requireHash(
            envelopeSigningHash(deployId, hashing.blake2b256),
            "blake2b256",
        );

        return {
            proto,
            publicKey: publicKey.slice(),
            fundingIntent,
            signingPayload,
            deployId,
            signingHash,
        };
    });

// Adds the signature of `prepared.signingHash` and encodes the offer. The
// signature must be a strict DER signature with a low S value, made with the
// key `prepared.publicKey`.
export const finishOwnerDirectOffer = (
    prepared: PreparedOwnerDirectOffer,
    signature: Uint8Array,
): OwnerDirectOffer => {
    if (
        !(signature instanceof Uint8Array) ||
        !isCanonicalLowSDerSignature(signature)
    ) {
        throw invalidOffer(
            "protocol-v6 signer has a non-canonical signature: a strict DER signature with a low S value is required",
        );
    }

    const deployDataProto: Uint8Array = encodeOfferedDeployProto(
        prepared.proto,
        prepared.fundingIntent,
        {
            deployId: prepared.deployId,
            formatVersion: OFFERED_FUNDED_DEPLOY_AUTHORIZATION_VERSION,
            publicKey: prepared.publicKey,
            presenceBitmap: SINGLE_SIGNER_PRESENCE_BITMAP,
            signature,
        },
    );

    return {
        deployDataProto,
        deployDataProtoBase64: bytesToBase64(deployDataProto),
        deployId: prepared.deployId,
        deployIdHex: bytesToHex(prepared.deployId),
        signingHash: prepared.signingHash,
        signature,
        fundingIntent: prepared.fundingIntent,
        signingPayload: prepared.signingPayload,
    };
};

// Builds and signs the owner-direct offer of `request.body`. The signer's
// vault funds every class of `request.genesisSchedule` at `phloPrice`.
export const createOwnerDirectOffer = async (
    request: OwnerOfferRequest,
    signer: OwnerOfferSigner,
    hashing: OwnerOfferHashing,
): Promise<OwnerDirectOffer> => {
    const prepared: PreparedOwnerDirectOffer = prepareOwnerDirectOffer(
        request,
        signer.publicKey,
        hashing,
    );

    return finishOwnerDirectOffer(
        prepared,
        await signer.sign(prepared.signingHash),
    );
};
