import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPublicKey, sign, verify } from "@noble/secp256k1";
import blakejs from "blakejs";

import { DEFAULT_PHLO_PRICE } from "@config/index";
import { IApiClients } from "@domains/ApiClientManager";
import { DeployData, PhloPrice } from "@domains/Deploy";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import RustNodeApiAdapter from "@domains/NodeApiAdapter/Rust";
import ScalaNodeApiAdapter from "@domains/NodeApiAdapter/Scala";
import SignerService, { SignedResult } from "@services/Signer";
import { createDeployPhlo, IDeployPhlo } from "@fabrics/deployPhlo";
import {
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

const DEPLOY_HASH_LENGTH: number = 32;
const PRIVATE_KEY_LENGTH: number = 32;
const SYNTHETIC_PRIVATE_KEY_BYTE: number = 1;

const SYNTHETIC_PRIVATE_KEY: Uint8Array = new Uint8Array(
    PRIVATE_KEY_LENGTH,
).fill(SYNTHETIC_PRIVATE_KEY_BYTE);

const CLASSIC_PHLO_PRICE: number = 1;

const DEFAULT_MIN_PHLO_PRICE: bigint = BigInt(DEFAULT_PHLO_PRICE);

const WIDE_PHLO_PRICE: string = "9007199254740993";
const WIDE_PHLO_LIMIT: number = 3;
const WIDE_MAX_PHLO_CHARGE: bigint = 27021597764222979n;

const PHLO_CHARGE_OVERFLOW_ERROR: RegExp = /charge exceeds uint256/;

const SUBMITTED_VECTOR_INDEX: number = 2;

const VALID_UINT256_VALUES: unknown[] = [
    0,
    1,
    Number.MAX_SAFE_INTEGER,
    "0",
    "9007199254740993",
    MAX_UINT256.toString(),
    0n,
    MAX_UINT256,
];

const INVALID_UINT256_VALUES: unknown[] = [
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

const INVALID_SERIALIZED_PHLO_PRICES: DeployData["phloPrice"][] = [
    -1,
    1.5,
    "-1",
    "01",
    "1e3",
    (MAX_UINT256 + 1n).toString(),
    (1n << 260n).toString(),
];

const VALID_RUST_PHLO_PRICES: PhloPrice[] = [
    1,
    "1",
    "9007199254740993",
    1n << 128n,
    MAX_UINT256,
];

const INVALID_RUST_PHLO_PRICES: PhloPrice[] = [
    0,
    "0",
    0n,
    "01",
    MAX_UINT256 + 1n,
];

const INVALID_PHLO_LIMITS: number[] = [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
];

const fixture: INodeVectorsFixture = JSON.parse(
    readFileSync(
        new URL("../../fixtures/uint256/node-vectors.json", import.meta.url),
        "utf8",
    ),
) as INodeVectorsFixture;

const rustApi: NodeApiAdapter = new RustNodeApiAdapter({} as IApiClients);
const scalaApi: NodeApiAdapter = new ScalaNodeApiAdapter({} as IApiClients);

const hashDeployData = (api: NodeApiAdapter, data: DeployData): string =>
    blake2bHex(api.serializeDeployData(data), undefined, DEPLOY_HASH_LENGTH);

for (const vector of fixture.vectors) {
    test(`rust adapter matches the node vector price=${vector.data.phloPrice}, previousBlock=${vector.data.validAfterBlockNumber}`, async () => {
        console.log("\n=== NODE VECTOR ===");
        console.log("    Source revision:", fixture.sourceRevision);
        console.log("    Phlo price:", vector.data.phloPrice);
        console.log("    Previous block:", vector.data.validAfterBlockNumber);

        const bytes: Uint8Array = rustApi.serializeDeployData(vector.data);
        const hash: string = blake2bHex(bytes, undefined, DEPLOY_HASH_LENGTH);
        const signature: Uint8Array = await sign(hash, SYNTHETIC_PRIVATE_KEY);

        assert.equal(encodeBase16(bytes), vector.protobufHex);
        assert.equal(hash, vector.hash);
        assert.equal(
            encodeBase16(getPublicKey(SYNTHETIC_PRIVATE_KEY)),
            vector.publicKey,
        );
        assert.equal(encodeBase16(signature), vector.signature);
        assert.equal(verify(vector.signature, hash, vector.publicKey), true);
    });
}

test("uint256 guard accepts exact integers from zero to the uint256 maximum", () => {
    console.log("\n=== UINT256 GUARD ===");

    for (const value of VALID_UINT256_VALUES) {
        assert.equal(isUint256(value), true, String(value));
    }

    for (const value of INVALID_UINT256_VALUES) {
        console.log("    Rejected:", String(value).slice(0, 20));

        assert.equal(isUint256(value), false, String(value));
    }
});

test("uint256 serializer rejects a phlo price that does not fit 32 bytes", () => {
    console.log("\n=== UINT256 SERIALIZER PRICE BOUNDS ===");

    const deployData: DeployData = fixture.vectors[0].data;

    for (const phloPrice of INVALID_SERIALIZED_PHLO_PRICES) {
        console.log("    Rejected:", String(phloPrice).slice(0, 20));

        assert.throws(
            () =>
                SignerService.deployDataUint256ProtobufSerialize({
                    ...deployData,
                    phloPrice,
                }),
            RangeError,
        );
    }
});

test("rust phlo settings accept wide prices and reject malformed values", () => {
    console.log("\n=== RUST PHLO SETTINGS ===");

    const maxPhloPrice: bigint = rustApi.getMaxPhloPrice();

    for (const phloPrice of VALID_RUST_PHLO_PRICES) {
        assert.equal(
            validatePhloSettings({ phloPrice }, { maxPhloPrice }).isValid,
            true,
            String(phloPrice),
        );
    }

    for (const phloPrice of INVALID_RUST_PHLO_PRICES) {
        console.log("    Rejected price:", String(phloPrice));

        assert.equal(
            validatePhloSettings({ phloPrice }, { maxPhloPrice }).isValid,
            false,
        );
    }

    for (const phloLimit of INVALID_PHLO_LIMITS) {
        console.log("    Rejected limit:", String(phloLimit));

        assert.equal(
            validatePhloSettings({ phloLimit }, { maxPhloPrice }).isValid,
            false,
        );
    }
});

test("deploy phlo keeps the exact maximum charge and refuses a charge above uint256", () => {
    console.log("\n=== DEPLOY PHLO CHARGE ===");

    const { phloLimit, phloPrice, maxPhloCharge }: IDeployPhlo =
        createDeployPhlo(
            { phloLimit: WIDE_PHLO_LIMIT, phloPrice: WIDE_PHLO_PRICE },
            DEFAULT_MIN_PHLO_PRICE,
        );

    const maxPriceCharge: bigint = createDeployPhlo(
        { phloLimit: 1, phloPrice: MAX_UINT256 },
        DEFAULT_MIN_PHLO_PRICE,
    ).maxPhloCharge;

    console.log("    Maximum charge:", maxPhloCharge.toString());

    assert.equal(phloLimit, WIDE_PHLO_LIMIT);
    assert.equal(phloPrice, BigInt(WIDE_PHLO_PRICE));
    assert.equal(maxPhloCharge, WIDE_MAX_PHLO_CHARGE);
    assert.equal(maxPriceCharge, MAX_UINT256);
    assert.throws(
        () =>
            createDeployPhlo(
                { phloLimit: 2, phloPrice: MAX_UINT256 },
                DEFAULT_MIN_PHLO_PRICE,
            ),
        PHLO_CHARGE_OVERFLOW_ERROR,
    );
});

test("scala and rust adapters serialize the same deploy into different price fields", () => {
    console.log("\n=== CLASSIC AND UINT256 SERIALIZATION ===");

    const vector: INodeVector = fixture.vectors[0];
    const data: DeployData = { ...vector.data, phloPrice: CLASSIC_PHLO_PRICE };

    const classicHex: string = encodeBase16(scalaApi.serializeDeployData(data));
    const uint256Hex: string = encodeBase16(rustApi.serializeDeployData(data));

    console.log("    Classic:", classicHex);
    console.log("    Uint256:", uint256Hex);

    assert.equal(uint256Hex, vector.protobufHex);
    assert.notEqual(classicHex, uint256Hex);
});

test("a deploy signed under one node API profile does not verify under the other", async () => {
    console.log("\n=== MISMATCHED NODE API PROFILES ===");

    const data: DeployData = fixture.vectors[0].data;
    const publicKey: Uint8Array = getPublicKey(SYNTHETIC_PRIVATE_KEY);

    const rustHash: string = hashDeployData(rustApi, data);
    const scalaHash: string = hashDeployData(scalaApi, data);

    const rustSignature: Uint8Array = await sign(
        rustHash,
        SYNTHETIC_PRIVATE_KEY,
    );
    const scalaSignature: Uint8Array = await sign(
        scalaHash,
        SYNTHETIC_PRIVATE_KEY,
    );

    console.log("    Rust hash:", rustHash);
    console.log("    Scala hash:", scalaHash);

    assert.notEqual(rustHash, scalaHash);
    assert.equal(verify(rustSignature, rustHash, publicKey), true);
    assert.equal(verify(rustSignature, scalaHash, publicKey), false);
    assert.equal(verify(scalaSignature, scalaHash, publicKey), true);
    assert.equal(verify(scalaSignature, rustHash, publicKey), false);
});

test("rust submission sends the signed deploy unchanged", async () => {
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

    const vector: INodeVector = fixture.vectors[SUBMITTED_VECTOR_INDEX];

    const signed: SignedResult = {
        data: vector.data,
        signature: vector.signature,
        deployer: vector.publicKey,
        sigAlgorithm: "secp256k1",
    };

    await new RustNodeApiAdapter(clients).submitDeploy(signed);

    console.log("    Requests sent:", requests.length);

    assert.deepEqual(requests, [signed]);
});
