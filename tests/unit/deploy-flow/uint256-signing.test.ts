import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPublicKey, sign, verify } from "@noble/secp256k1";
import blakejs from "blakejs";

import { IApiClients } from "@domains/ApiClientManager";
import { DeployData, PhloPrice } from "@domains/Deploy";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import RustNodeApiAdapter from "@domains/NodeApiAdapter/Rust";
import ScalaNodeApiAdapter from "@domains/NodeApiAdapter/Scala";
import { SignedResult } from "@services/Signer";
import { createDeployPhlo } from "@fabrics/deployPhlo";
import {
    bigIntToBuffer,
    encodeBase16,
    isUint256,
    MAX_UINT256,
    validatePhloSettings,
} from "@utils/index";

const { blake2bHex } = blakejs;

interface INodeVector {
    data: DeployData;
    hash: string;
    protobufHex: string;
    publicKey: string;
    signature: string;
}

interface INodeVectorsFixture {
    sourceRevision: string;
    vectors: INodeVector[];
}

const DEPLOY_HASH_LENGTH = 32;
const UINT256_BYTES_LENGTH = 32;
const MAX_BYTE = 255;

const SYNTHETIC_PRIVATE_KEY: Uint8Array = new Uint8Array(32).fill(1);

const CLASSIC_PROTOBUF_HEX =
    "121d6e65772072657475726e20696e207b2072657475726e2128343229207d18fb80b3c19c333801400150ffffffffffffffffff015a04726f6f74";

const fixture: INodeVectorsFixture = JSON.parse(
    readFileSync(
        new URL("../../fixtures/uint256/node-vectors.json", import.meta.url),
        "utf8",
    ),
) as INodeVectorsFixture;

const rustApi: NodeApiAdapter = new RustNodeApiAdapter({} as IApiClients);
const scalaApi: NodeApiAdapter = new ScalaNodeApiAdapter({} as IApiClients);

const toHex = (bytes: Uint8Array): string => encodeBase16(bytes);

console.log("\n[NODE VECTORS]");
console.log("    Source revision:", fixture.sourceRevision);
console.log("    Vectors:", fixture.vectors.length);

for (const vector of fixture.vectors) {
    test(`rust adapter matches the node vector price=${vector.data.phloPrice}, previousBlock=${vector.data.validAfterBlockNumber}`, async () => {
        const bytes: Uint8Array = rustApi.serializeDeployData(vector.data);
        const hash: string = blake2bHex(bytes, undefined, DEPLOY_HASH_LENGTH);
        const signature: Uint8Array = await sign(hash, SYNTHETIC_PRIVATE_KEY);

        assert.equal(toHex(bytes), vector.protobufHex);
        assert.equal(hash, vector.hash);
        assert.equal(toHex(getPublicKey(SYNTHETIC_PRIVATE_KEY)), vector.publicKey);
        assert.equal(toHex(signature), vector.signature);
        assert.equal(verify(vector.signature, hash, vector.publicKey), true);
    });
}

test("uint256 guard accepts exact integers from zero to the uint256 maximum", () => {
    console.log("\n=== UINT256 GUARD ===");

    const validValues: unknown[] = [
        0,
        1,
        Number.MAX_SAFE_INTEGER,
        "0",
        "9007199254740993",
        MAX_UINT256.toString(),
        0n,
        MAX_UINT256,
    ];

    const invalidValues: unknown[] = [
        null,
        undefined,
        {},
        "",
        "01",
        "-0",
        "+1",
        " 1",
        "1 ",
        "1.0",
        "1e2",
        "9".repeat(100),
        (MAX_UINT256 + 1n).toString(),
        -1,
        0.1,
        Number.MAX_SAFE_INTEGER + 1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -1n,
        MAX_UINT256 + 1n,
    ];

    for (const value of validValues) {
        assert.equal(isUint256(value), true, String(value));
    }

    for (const value of invalidValues) {
        console.log("    Rejected:", String(value).slice(0, 20));

        assert.equal(isUint256(value), false, String(value));
    }
});

test("uint256 phlo price is encoded as 32 big endian bytes", () => {
    console.log("\n=== UINT256 PRICE ENCODING ===");

    const zero: Uint8Array = bigIntToBuffer(0n);
    const one: Uint8Array = bigIntToBuffer(1n);
    const max: Uint8Array = bigIntToBuffer(MAX_UINT256);

    console.log("    One:", toHex(one));

    assert.deepEqual(zero, new Uint8Array(UINT256_BYTES_LENGTH));
    assert.equal(one.length, UINT256_BYTES_LENGTH);
    assert.equal(one[UINT256_BYTES_LENGTH - 1], 1);
    assert.deepEqual(max, new Uint8Array(UINT256_BYTES_LENGTH).fill(MAX_BYTE));
});

test("rust phlo settings accept wide prices and reject malformed values", () => {
    console.log("\n=== RUST PHLO SETTINGS ===");

    const maxPhloPrice: bigint = rustApi.getMaxPhloPrice();

    const validPrices: PhloPrice[] = [
        1,
        "1",
        "9007199254740993",
        1n << 128n,
        MAX_UINT256,
    ];

    const invalidPrices: unknown[] = [0, "0", 0n, "01", MAX_UINT256 + 1n];

    const invalidLimits: unknown[] = [
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
    ];

    for (const phloPrice of validPrices) {
        assert.equal(
            validatePhloSettings({ phloPrice }, { maxPhloPrice }).isValid,
            true,
            String(phloPrice),
        );
    }

    for (const phloPrice of invalidPrices) {
        console.log("    Rejected price:", String(phloPrice));

        assert.equal(
            validatePhloSettings(
                { phloPrice: phloPrice as PhloPrice },
                { maxPhloPrice },
            ).isValid,
            false,
        );
    }

    for (const phloLimit of invalidLimits) {
        console.log("    Rejected limit:", String(phloLimit));

        assert.equal(
            validatePhloSettings(
                { phloLimit: phloLimit as number },
                { maxPhloPrice },
            ).isValid,
            false,
        );
    }
});

test("deploy phlo keeps the exact maximum charge and refuses a charge above uint256", () => {
    console.log("\n=== DEPLOY PHLO CHARGE ===");

    const { phloLimit, phloPrice, maxPhloCharge } = createDeployPhlo({
        phloLimit: 3,
        phloPrice: "9007199254740993",
    });

    console.log("    Maximum charge:", maxPhloCharge.toString());

    assert.equal(phloLimit, 3);
    assert.equal(phloPrice, 9007199254740993n);
    assert.equal(maxPhloCharge, 27021597764222979n);
    assert.equal(
        createDeployPhlo({ phloLimit: 1, phloPrice: MAX_UINT256 })
            .maxPhloCharge,
        MAX_UINT256,
    );
    assert.throws(
        () => createDeployPhlo({ phloLimit: 2, phloPrice: MAX_UINT256 }),
        /charge exceeds uint256/,
    );
});

test("scala and rust adapters serialize the same deploy into different price fields", () => {
    console.log("\n=== CLASSIC AND UINT256 SERIALIZATION ===");

    const data: DeployData = { ...fixture.vectors[0].data, phloPrice: 1 };

    const classic: Uint8Array = scalaApi.serializeDeployData(data);
    const uint256: Uint8Array = rustApi.serializeDeployData(data);

    console.log("    Classic:", toHex(classic));
    console.log("    Uint256:", toHex(uint256));

    assert.equal(toHex(classic), CLASSIC_PROTOBUF_HEX);
    assert.equal(toHex(uint256), fixture.vectors[0].protobufHex);
    assert.notEqual(toHex(classic), toHex(uint256));
});

test("rust submission sends the signed deploy with the decimal price string", async () => {
    console.log("\n=== RUST SUBMISSION REQUEST ===");

    const requests: unknown[] = [];

    const clients: IApiClients = {
        validator: {
            submitDeploy: async (body: unknown) => {
                requests.push(body);

                return "ok";
            },
        },
    } as unknown as IApiClients;

    const vector: INodeVector = fixture.vectors[2];

    const signed: SignedResult = {
        data: vector.data,
        signature: vector.signature,
        deployer: vector.publicKey,
        sigAlgorithm: "secp256k1",
    };

    await new RustNodeApiAdapter(clients).submitDeploy(signed);

    const sentPrice: unknown = JSON.parse(JSON.stringify(requests[0])).data
        .phloPrice;

    console.log("    Sent phlo price:", sentPrice);

    assert.deepEqual(requests, [signed]);
    assert.equal(sentPrice, "9007199254740993");
});
