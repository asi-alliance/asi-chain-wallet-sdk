import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPublicKey, sign } from "@noble/secp256k1";
import blakejs from "blakejs";
import sha3 from "js-sha3";

import { ASI_RESOURCE_POLICY_HEX } from "@config/index";
import {
    OwnerDirectOffer,
    OwnerOfferHashing,
    createOwnerDirectOffer,
    decodeResourcePolicyHex,
} from "@services/OwnerOffer";
import { blake2b256, hex, signedScheduleOf } from "./offered-deploy-reader";

const { blake2b } = blakejs;
const { keccak256 } = sha3;

// The golden vectors of the Rust builder `owner_direct_offer` at f1r3node-rust
// fe6cce76e8a0766039342eac644b0dbbecf5bae1 (R-5). The fixture is a verbatim
// copy of the vectors file. When the Rust vectors change, copy the new file
// here: the test then fails until the encoder matches again.
interface IOfferVector {
    name: string;
    inputs: {
        expiration_timestamp: number;
        language: string;
        phlo_limit: number;
        phlo_price: number;
        private_key_hex: string;
        public_key_hex: string;
        shard_id: string;
        term: string;
        timestamp: number;
        valid_after_block_number: number;
    };
    outputs: {
        deploy_data_proto_hex: string;
        deploy_id_hex: string;
        envelope_intent_hex: string;
        funding_intent_hex: string;
        schedule_commitment_hex: string;
        signature_der_hex: string;
        signed_schedule_hex: string;
        signing_hash_hex: string;
    };
}

interface IOfferVectorFile {
    format: string;
    node_crates: string;
    resource_policy_hex: string;
    cases: IOfferVector[];
}

const VECTORS: IOfferVectorFile = JSON.parse(
    readFileSync(
        new URL("./fixtures/owner-direct-offer-vectors.json", import.meta.url),
        "utf8",
    ),
);

const HASHING: OwnerOfferHashing = {
    blake2b256: (data: Uint8Array): Uint8Array => blake2b(data, undefined, 32),
    keccak256: (data: Uint8Array): Uint8Array =>
        new Uint8Array(keccak256.arrayBuffer(data)),
};

test("the vectors pin the node revision and the SDK's ASI resource policy", () => {
    console.log("\n=== VECTOR FILE ===");
    console.log("    Format:", VECTORS.format);
    console.log("    Cases:", VECTORS.cases.map((vector) => vector.name));

    assert.equal(VECTORS.format, "rust-client owner-direct offer vectors, version 1");
    assert.match(VECTORS.node_crates, /fe6cce76e8a0766039342eac644b0dbbecf5bae1/);
    assert.equal(VECTORS.resource_policy_hex, ASI_RESOURCE_POLICY_HEX);
    assert.equal(VECTORS.cases.length, 3);
});

for (const vector of VECTORS.cases) {
    test(`the encoder reproduces the Rust owner-direct offer byte for byte: ${vector.name}`, async () => {
        console.log(`\n=== VECTOR ${vector.name} ===`);

        const { inputs, outputs } = vector;
        const publicKey: Uint8Array = getPublicKey(inputs.private_key_hex);

        assert.equal(inputs.language, "rholang");
        assert.equal(hex(publicKey), inputs.public_key_hex);

        const offer: OwnerDirectOffer = await createOwnerDirectOffer(
            {
                body: {
                    term: inputs.term,
                    timestamp: inputs.timestamp,
                    validAfterBlockNumber: inputs.valid_after_block_number,
                    shardId: inputs.shard_id,
                    expirationTimestamp: inputs.expiration_timestamp,
                },
                phloLimit: inputs.phlo_limit,
                phloPrice: inputs.phlo_price,
                genesisSchedule: decodeResourcePolicyHex(VECTORS.resource_policy_hex)
                    .schedule,
            },
            {
                publicKey,
                sign: (signingHash: Uint8Array): Promise<Uint8Array> =>
                    sign(signingHash, inputs.private_key_hex),
            },
            HASHING,
        );
        const signedSchedule: Uint8Array = signedScheduleOf(offer.fundingIntent);

        console.log("    Phlo limit:", inputs.phlo_limit);
        console.log("    Deploy ID:", offer.deployIdHex);

        assert.equal(hex(signedSchedule), outputs.signed_schedule_hex);
        assert.equal(hex(blake2b256(signedSchedule)), outputs.schedule_commitment_hex);
        assert.equal(hex(offer.fundingIntent), outputs.funding_intent_hex);
        assert.equal(hex(offer.signingPayload), outputs.envelope_intent_hex);
        assert.equal(offer.deployIdHex, outputs.deploy_id_hex);
        assert.equal(hex(offer.signingHash), outputs.signing_hash_hex);
        assert.equal(hex(offer.signature), outputs.signature_der_hex);
        assert.equal(hex(offer.deployDataProto), outputs.deploy_data_proto_hex);
        assert.equal(
            offer.deployDataProtoBase64,
            Buffer.from(outputs.deploy_data_proto_hex, "hex").toString("base64"),
        );
    });
}
