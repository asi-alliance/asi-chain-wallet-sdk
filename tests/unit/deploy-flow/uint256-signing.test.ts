import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sign, verify, getPublicKey } from "@noble/secp256k1";
import blakejs from "blakejs";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import SignerService from "@services/Signer";
import { DeployData } from "@domains/Deploy";
import { encodeTokenAmount, parseTokenAmount, resolveDeployPhlo, MAX_TOKEN_AMOUNT } from "@utils/monetary";
import { createNodeApiAdapter } from "@fabrics/nodeApiAdapter";
import type { IApiClients } from "@domains/ApiClientManager";

const profile = NodeApiProfile.RUST;
const fixture = JSON.parse(readFileSync(new URL("../../fixtures/uint256/node-vectors.json", import.meta.url), "utf8"));
const syntheticKey = new Uint8Array(32).fill(1);

for (const vector of fixture.vectors) {
    test(`node vector price=${vector.data.phloPrice}, previousBlock=${vector.data.validAfterBlockNumber}`, async () => {
        const bytes = SignerService.deployDataProtobufSerialize(vector.data, profile);
        assert.equal(Buffer.from(bytes).toString("hex"), vector.protobufHex);
        const hash = blakejs.blake2bHex(bytes, undefined, 32);
        assert.equal(hash, vector.hash);
        assert.equal(Buffer.from(getPublicKey(syntheticKey)).toString("hex"), vector.publicKey);
        assert.equal(Buffer.from(await sign(hash, syntheticKey)).toString("hex"), vector.signature);
        assert.equal(verify(vector.signature, hash, vector.publicKey), true);
    });
}

test("price codecs reject malformed, rounded and out-of-range monetary inputs", () => {
    for (const value of [null, undefined, {}, "", "01", "-0", "+1", " 1", "1 ", "1.0", "1e2", "9".repeat(10000), -1n,
        MAX_TOKEN_AMOUNT + 1n, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -0, 0.1]) {
        assert.throws(() => parseTokenAmount(value), String(value));
    }
    assert.deepEqual(encodeTokenAmount(0), new Uint8Array(32));
    assert.deepEqual(encodeTokenAmount(MAX_TOKEN_AMOUNT), new Uint8Array(32).fill(255));
    assert.equal(resolveDeployPhlo({ phloLimit: 1, phloPrice: MAX_TOKEN_AMOUNT }, profile).phloPrice, MAX_TOKEN_AMOUNT.toString());
    for (const phloPrice of [0, "0", null, "01", MAX_TOKEN_AMOUNT + 1n]) {
        assert.throws(() => resolveDeployPhlo({ phloPrice } as never, profile));
    }
    for (const phloLimit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) {
        assert.throws(() => resolveDeployPhlo({ phloLimit } as never, profile));
    }
    assert.throws(() => resolveDeployPhlo({ phloLimit: 2, phloPrice: MAX_TOKEN_AMOUNT }, profile), /charge exceeds/);
});

test("classic and uint256 signing remain deliberately separate", () => {
    const data = { ...fixture.vectors[0].data, phloPrice: 1 } as DeployData;
    const classic = SignerService.deployDataProtobufSerialize(data, NodeApiProfile.SCALA);
    const uint256 = SignerService.deployDataProtobufSerialize(data, profile);
    assert.notDeepEqual(classic, uint256);
    assert.equal(Buffer.from(classic).toString("hex"), "121d6e65772072657475726e20696e207b2072657475726e2128343229207d18fb80b3c19c333801400150ffffffffffffffffff015a04726f6f74");
    for (const price of ["1", 1n]) {
        assert.throws(() => resolveDeployPhlo({ phloPrice: price }, NodeApiProfile.SCALA), /classic profile/);
    }
    for (const field of ["parameters", "expirationTimestamp", "language"]) {
        assert.throws(() => SignerService.deployDataProtobufSerialize({ ...data, [field]: [] }, profile), /Unsupported/);
    }
});

test("submission sends canonical request strings and refuses profile mismatch before HTTP", async () => {
    const requests: unknown[] = [];
    const clients = { validator: { submitDeploy: async (body: unknown) => { requests.push(body); return "ok"; } } } as unknown as IApiClients;
    const adapter = createNodeApiAdapter(profile, clients);
    const vector = fixture.vectors[2];
    const signed = { data: vector.data, signature: vector.signature, deployer: vector.publicKey, sigAlgorithm: "secp256k1", nodeApiProfile: profile };
    await adapter.submitDeploy(signed);
    assert.deepEqual(requests, [{ data: vector.data, signature: vector.signature, deployer: vector.publicKey, sigAlgorithm: "secp256k1" }]);
    assert.equal(JSON.parse(JSON.stringify(requests[0])).data.phloPrice, "9007199254740993");
    assert.throws(() => adapter.submitDeploy({ ...signed, nodeApiProfile: NodeApiProfile.SCALA }), /profile mismatch/);
    assert.throws(() => adapter.submitDeploy({ ...signed, nodeApiProfile: undefined }), /profile mismatch/);
    assert.throws(() => adapter.submitDeploy({ ...signed, data: { ...signed.data, phloPrice: 1 } }), /profile mismatch/);
    assert.throws(() => createNodeApiAdapter(NodeApiProfile.SCALA, clients).submitDeploy(signed), /profile mismatch/);
    assert.equal(requests.length, 1);
});
