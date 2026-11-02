import test from "node:test";
import assert from "node:assert/strict";
import { getPublicKey, sign, verify } from "@noble/secp256k1";
import blakejs from "blakejs";
import bs58 from "bs58";
import sha3 from "js-sha3";

import {
    GENESIS_POLICY_LIMITS,
    MAX_SAFE_INTEGER,
    OwnerDirectOffer,
    OwnerOfferBody,
    OwnerOfferHashing,
    OwnerOfferRequest,
    OwnerOfferSigner,
    PhloGenesisPolicy,
    PhloScheduleV1,
    PreparedOwnerDirectOffer,
    bytesToBase58,
    bytesToBase64,
    bytesToHex,
    createOwnerDirectOffer,
    decodeGenesisPolicy,
    decodeResourcePolicyHex,
    decodeSchedule,
    encodeGenesisPolicy,
    encodeSchedule,
    finishOwnerDirectOffer,
    hexToBytes,
    isCanonicalLowSDerSignature,
    offeredBodyEncodedLength,
    prepareOwnerDirectOffer,
    u128MultiplyAdd,
} from "@services/OwnerOffer";
import WalletsService from "@services/Wallets";
import { ASI_RESOURCE_POLICY_HEX } from "@config/index";
import {
    IOfferedDeploy,
    ascii,
    beBytes,
    blake2b256,
    commitmentOf,
    concat,
    hex,
    lengthField,
    only,
    readOfferedDeploy,
    readProto,
    signedScheduleOf,
    signingHashOf,
    textBytes,
    wireFields,
} from "./offered-deploy-reader";

const { blake2b } = blakejs;
const { keccak256 } = sha3;

// The `resource-policy` of the shipped node configurations at f1r3node-rust
// fe6cce76e8a0766039342eac644b0dbbecf5bae1 (docker/conf/default.conf:35):
// shard `root`, network `test`, settlement asset `REV`. It is a codec
// fixture beside the ASI policy of the SDK configuration.
const SHIPPED_DEFAULT_POLICY_HEX: string =
    "0000000000000023663172336e6f64653a67656e657369732d7265736f757263652d706f6c6963793a763200000000000002db0000000000000019663172336e" +
    "6f64653a70686c6f2d7363686564756c653a7631000000000000000800000000000000060000000000000004746573740000000000000004726f6f7400000000" +
    "00000003524556000000000000000a61746f6d69632d524556000000000000000108000000000000021c000000000000000400000004000000000000007b0000" +
    "000000000007636f6d707574650000000000000004434f4d4d00000000000000204fe858a6554cf65acca907e41bbce0c6c1560ab65b78e1e52646a57d926fb3" +
    "830000000000000020352ed97b8fa1be92c134dbcbeb944bd03b57c5fe5b7eba3aae55941507182e940000000000000008000000000000000100000000000000" +
    "80000000000000000c696e74726f64756374696f6e0000000000000004627974650000000000000020bf524c59897ab7aa869ccf79c8a6f99095915608423961" +
    "9aa370d184e47e4a2f0000000000000020352ed97b8fa1be92c134dbcbeb944bd03b57c5fe5b7eba3aae55941507182e94000000000000000800000000000000" +
    "01000000000000007c00000000000000087472616e736665720000000000000004627974650000000000000020c8384c199e6cde2c0cac6afa3f1a9bf8be5082" +
    "0bcb84686f107201c4cab60cd80000000000000020352ed97b8fa1be92c134dbcbeb944bd03b57c5fe5b7eba3aae55941507182e940000000000000008000000" +
    "00000000010000000000000079000000000000000574726163650000000000000004627974650000000000000020908704256016b2861488c10ebb616755898a" +
    "e031ac1ba4dad81ec91fd05d355d0000000000000020352ed97b8fa1be92c134dbcbeb944bd03b57c5fe5b7eba3aae55941507182e9400000000000000080000" +
    "000000000001000000000000000800000000000000000000000000000008000000000000000100000000000000202595df679351956d36278953647cb3c4364e" +
    "a869ae33975df380722339402d88000000000000000101";

const PRIVATE_KEY_HEX: string =
    "5c1d6b3f0e2a9c4d8b7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c";
const TERM: string =
    'new stdout(`rho:io:stdout`) in { stdout!("owner-direct offer") }';
const TIMESTAMP: number = 1760000000000;
const VALID_AFTER_BLOCK_NUMBER: number = 41;
const SHARD_ID: string = "root";
const PHLO_LIMIT: number = 500000;
const PHLO_PRICE: number = 1;

const SECP256K1_ORDER: bigint = BigInt(
    "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
);

const HASHING: OwnerOfferHashing = {
    blake2b256: (data: Uint8Array): Uint8Array => blake2b(data, undefined, 32),
    keccak256: (data: Uint8Array): Uint8Array =>
        new Uint8Array(keccak256.arrayBuffer(data)),
};

const signerOf = (privateKeyHex: string): OwnerOfferSigner => ({
    publicKey: getPublicKey(privateKeyHex),
    sign: (signingHash: Uint8Array): Promise<Uint8Array> =>
        sign(signingHash, privateKeyHex),
});

const asiSchedule = (): PhloScheduleV1 =>
    decodeResourcePolicyHex(ASI_RESOURCE_POLICY_HEX).schedule;

const body = (overrides: Partial<OwnerOfferBody> = {}): OwnerOfferBody => ({
    term: TERM,
    timestamp: TIMESTAMP,
    validAfterBlockNumber: VALID_AFTER_BLOCK_NUMBER,
    shardId: SHARD_ID,
    ...overrides,
});

const request = (
    overrides: Partial<OwnerOfferRequest> = {},
): OwnerOfferRequest => ({
    body: body(),
    phloLimit: PHLO_LIMIT,
    phloPrice: PHLO_PRICE,
    genesisSchedule: asiSchedule(),
    ...overrides,
});

const describeSchedule = (schedule: PhloScheduleV1): unknown => ({
    protocolVersion: schedule.protocolVersion,
    network: ascii(schedule.network),
    shard: ascii(schedule.shard),
    settlementAsset: ascii(schedule.settlementAsset),
    settlementUnit: ascii(schedule.settlementUnit),
    decimalScale: schedule.decimalScale,
    actualPrice: schedule.actualPrice,
    classes: schedule.classes.map((resourceClass) => [
        ascii(resourceClass.identity),
        ascii(resourceClass.measurementUnit),
        resourceClass.weight,
    ]),
});

const NATIVE_CLASSES: unknown = [
    ["compute", "COMM", 1],
    ["introduction", "byte", 1],
    ["transfer", "byte", 1],
    ["trace", "byte", 1],
];

test("the genesis policies decode and encode back to the same bytes", () => {
    console.log("\n=== GENESIS POLICY CODEC ===");

    for (const [name, policyHex, labels] of [
        ["shipped default", SHIPPED_DEFAULT_POLICY_HEX, ["test", "REV", "atomic-REV"]],
        ["ASI", ASI_RESOURCE_POLICY_HEX, ["test", "ASI", "atomic-ASI"]],
    ] as [string, string, string[]][]) {
        const policy: PhloGenesisPolicy = decodeResourcePolicyHex(policyHex);

        console.log(`    ${name}:`, JSON.stringify(describeSchedule(policy.schedule)));

        assert.equal(policy.offeredFundedV6Active, true);
        assert.deepEqual(describeSchedule(policy.schedule), {
            protocolVersion: 6,
            network: labels[0],
            shard: "root",
            settlementAsset: labels[1],
            settlementUnit: labels[2],
            decimalScale: 8,
            actualPrice: 0,
            classes: NATIVE_CLASSES,
        });
        assert.equal(bytesToHex(encodeGenesisPolicy(policy)), policyHex);
    }

    const shipped: PhloScheduleV1 = decodeResourcePolicyHex(
        SHIPPED_DEFAULT_POLICY_HEX,
    ).schedule;
    const asi: PhloScheduleV1 = asiSchedule();

    assert.deepEqual(asi.classes, shipped.classes, "the ASI policy keeps the native classes");
    assert.deepEqual(asi.compatibilityRule, shipped.compatibilityRule);
});

test("a genesis policy that is not canonical is refused", () => {
    console.log("\n=== GENESIS POLICY REFUSALS ===");

    const input: Uint8Array = hexToBytes(ASI_RESOURCE_POLICY_HEX);

    const otherDomain: Uint8Array = input.slice();
    otherDomain[8] ^= 0x01;
    assert.throws(
        () => decodeGenesisPolicy(otherDomain),
        /unsupported phlo schedule format domain/,
    );

    assert.throws(
        () => decodeGenesisPolicy(concat([input, new Uint8Array([0])])),
        /phlo wire data contains trailing bytes/,
    );

    const policy: PhloGenesisPolicy = decodeGenesisPolicy(input);
    const pricedPolicy: Uint8Array = encodeGenesisPolicy({
        ...policy,
        scheduleBytes: encodeSchedule(
            { ...policy.schedule, actualPrice: 1 },
            GENESIS_POLICY_LIMITS,
        ),
    });

    assert.throws(
        () => decodeGenesisPolicy(pricedPolicy),
        /genesis resource policy must not contain an offered price/,
    );

    const inactiveProtocol5: Uint8Array = encodeGenesisPolicy({
        ...policy,
        offeredFundedV6Active: false,
        scheduleBytes: encodeSchedule(
            { ...policy.schedule, protocolVersion: 5 },
            GENESIS_POLICY_LIMITS,
        ),
    });

    assert.equal(decodeGenesisPolicy(inactiveProtocol5).offeredFundedV6Active, false);
    assert.throws(
        () =>
            encodeGenesisPolicy({
                ...decodeGenesisPolicy(inactiveProtocol5),
                offeredFundedV6Active: true,
            }),
        /noncanonical offered-funded activation/,
    );
});

test("an owner-direct offer is a canonical offered deploy that commits to its deploy ID", async () => {
    console.log("\n=== OFFER STRUCTURE ===");

    const signer: OwnerOfferSigner = signerOf(PRIVATE_KEY_HEX);
    const offer: OwnerDirectOffer = await createOwnerDirectOffer(
        request(),
        signer,
        HASHING,
    );
    const read: IOfferedDeploy = readOfferedDeploy(offer.deployDataProto);

    console.log("    Deploy ID:", offer.deployIdHex);
    console.log("    Proto bytes:", offer.deployDataProto.length);

    assert.match(offer.deployIdHex, /^[0-9a-f]{64}$/);
    assert.equal(
        offer.deployDataProtoBase64,
        Buffer.from(offer.deployDataProto).toString("base64"),
    );
    assert.deepEqual(
        read.fieldOrder,
        [2, 3, 7, 8, 10, 11, 12, 19, 20, 21],
        "each field appears once, in tag order, and no legacy field appears",
    );
    assert.equal(read.term, TERM);
    assert.equal(read.timestamp, BigInt(TIMESTAMP));
    assert.equal(read.phloPrice, BigInt(PHLO_PRICE));
    assert.equal(read.phloLimit, BigInt(PHLO_LIMIT));
    assert.equal(read.validAfterBlockNumber, BigInt(VALID_AFTER_BLOCK_NUMBER));
    assert.equal(read.shardId, SHARD_ID);
    assert.equal(read.language, "rholang");
    assert.equal(hex(read.deployId), offer.deployIdHex);
    assert.equal(read.formatVersion, 0x00060003n);
    assert.equal(read.scheme, 1n);
    assert.equal(hex(read.publicKey), hex(signer.publicKey));
    assert.equal(hex(read.presenceBitmap), "01");
    assert.deepEqual(read.witnessFieldOrder, [2], "member index 0 is omitted");
    assert.equal(hex(read.signature), hex(offer.signature));
    assert.equal(hex(read.fundingIntent), hex(offer.fundingIntent));

    // The size check of `OfferedFundedDeploy::new` counts the proto without
    // the deploy ID (field 19) and the authorization (field 20).
    const authorization: Uint8Array = only(readProto(offer.deployDataProto), 20)
        .bytes!;
    const lengthOfLength: number = authorization.length < 128 ? 1 : 2;

    assert.equal(
        offeredBodyEncodedLength(
            {
                term: TERM,
                timestamp: TIMESTAMP,
                phloPrice: PHLO_PRICE,
                phloLimit: PHLO_LIMIT,
                validAfterBlockNumber: VALID_AFTER_BLOCK_NUMBER,
                shardId: SHARD_ID,
                language: "rholang",
                expirationTimestamp: 0,
            },
            offer.fundingIntent,
        ),
        offer.deployDataProto.length -
            (2 + 1 + 32) -
            (2 + lengthOfLength + authorization.length),
    );

    const commitment: Uint8Array = commitmentOf(offer.signingPayload, signer.publicKey);
    const signingHash: Uint8Array = signingHashOf(commitment);

    assert.equal(offer.deployIdHex, hex(commitment));
    assert.equal(hex(offer.signingHash), hex(signingHash));
    assert.equal(verify(offer.signature, signingHash, signer.publicKey), true);
    assert.equal(isCanonicalLowSDerSignature(offer.signature), true);
});

test("the signing payload signs the body, the funding intent, the limit and the price", async () => {
    console.log("\n=== SIGNING PAYLOAD ===");

    const offer: OwnerDirectOffer = await createOwnerDirectOffer(
        request(),
        signerOf(PRIVATE_KEY_HEX),
        HASHING,
    );

    assert.deepEqual(Array.from(offer.signingPayload.subarray(0, 2)), [0, 3]);

    const fields: Uint8Array[] = wireFields(offer.signingPayload.subarray(2));

    assert.equal(fields.length, 6);

    const [domain, version, bodyIntent, fundingIntent, limit, price] = fields;

    assert.equal(ascii(domain), "f1r3node:offered-funded-deploy-intent:v1");
    assert.equal(hex(version), "00060003");
    assert.equal(
        hex(bodyIntent),
        hex(
            concat([
                beBytes(1n, 2),
                new Uint8Array([1]),
                lengthField(textBytes(TERM)),
                beBytes(BigInt(TIMESTAMP), 8),
                beBytes(BigInt(VALID_AFTER_BLOCK_NUMBER), 8),
                lengthField(textBytes(SHARD_ID)),
                new Uint8Array([0]),
                beBytes(0n, 4),
            ]),
        ),
    );
    assert.equal(hex(fundingIntent), hex(offer.fundingIntent));
    assert.equal(hex(limit), hex(beBytes(BigInt(PHLO_LIMIT), 8)));
    assert.equal(hex(price), hex(beBytes(BigInt(PHLO_PRICE), 8)));

    const expiring: OwnerDirectOffer = await createOwnerDirectOffer(
        request({ body: body({ expirationTimestamp: TIMESTAMP + 60000 }) }),
        signerOf(PRIVATE_KEY_HEX),
        HASHING,
    );
    const [, , expiringIntent] = wireFields(expiring.signingPayload.subarray(2));

    assert.equal(
        hex(expiringIntent.subarray(expiringIntent.length - 13)),
        hex(
            concat([
                new Uint8Array([1]),
                beBytes(BigInt(TIMESTAMP + 60000), 8),
                beBytes(0n, 4),
            ]),
        ),
    );
});

test("the funding intent lets the signer's vault fund every class at the signed price", async () => {
    console.log("\n=== FUNDING INTENT ===");

    const phloLimit: number = 1000;
    const phloPrice: number = 2;
    const signer: OwnerOfferSigner = signerOf(PRIVATE_KEY_HEX);
    const schedule: PhloScheduleV1 = asiSchedule();
    const offer: OwnerDirectOffer = await createOwnerDirectOffer(
        request({ phloLimit, phloPrice }),
        signer,
        HASHING,
    );
    const ceiling: bigint = BigInt(phloLimit) * BigInt(phloPrice) + 1n;
    const [v2Domain, base, grants, conversion] = wireFields(offer.fundingIntent);

    assert.equal(ascii(v2Domain), "f1r3node:phlo-funding-intent:v2");
    assert.deepEqual(wireFields(grants).map(hex), ["00000000"]);
    assert.deepEqual(wireFields(conversion).map(hex), ["00"]);

    const [v1Domain, controls, scheduleCommitment, totalExposure, sources] =
        wireFields(base);

    assert.equal(ascii(v1Domain), "f1r3node:phlo-funding-intent:v1");
    assert.equal(hex(totalExposure), hex(beBytes(ceiling, 16)));

    const [controlsDomain, limit, priceCeiling, owners] = wireFields(controls);
    const signedSchedule: Uint8Array = signedScheduleOf(offer.fundingIntent);

    assert.equal(ascii(controlsDomain), "f1r3node:phlo-controls:v1");
    assert.equal(hex(limit), hex(beBytes(BigInt(phloLimit), 8)));
    assert.equal(hex(priceCeiling), hex(beBytes(BigInt(phloPrice), 8)));
    assert.deepEqual(wireFields(owners).map(hex), [
        "00000001",
        hex(beBytes(BigInt(phloPrice), 8)),
    ]);
    assert.equal(hex(scheduleCommitment), hex(blake2b256(signedSchedule)));
    assert.deepEqual(decodeSchedule(signedSchedule, GENESIS_POLICY_LIMITS), {
        ...schedule,
        actualPrice: phloPrice,
    });

    const [sourceCount, source] = wireFields(sources);

    assert.equal(hex(sourceCount), "00000001");

    const [sourceDomain, custody, holdCap, debitCap, feePermitted, permissions] =
        wireFields(source);
    const address: string = WalletsService.deriveAddressFromPublicKey(
        signer.publicKey,
    );

    console.log("    Vault address:", address);

    assert.equal(ascii(sourceDomain), "f1r3node:phlo-source:v1");
    assert.equal(
        hex(custody),
        hex(
            blake2b256(
                concat([
                    textBytes("f1r3node:system-vault-custody:v1"),
                    textBytes(address),
                ]),
            ),
        ),
    );
    assert.equal(hex(holdCap), hex(beBytes(ceiling, 8)));
    assert.equal(hex(debitCap), hex(beBytes(ceiling, 8)));
    assert.equal(hex(feePermitted), "01");

    const [permissionCount, ...keys] = wireFields(permissions);
    const ground: Uint8Array = concat([
        beBytes(1n, 2),
        beBytes(65n, 4),
        signer.publicKey,
    ]);
    const location: Uint8Array = concat([
        new Uint8Array([0x3a, 0x24, 0x0a, 0x22, 0x0a, 0x20]),
        blake2b256(ground),
    ]);

    assert.equal(hex(permissionCount), "00000004");
    assert.equal(keys.length, schedule.classes.length);

    keys.forEach((key: Uint8Array, classIndex: number) => {
        const [keyDomain, keyLocation, keyClass, acquisitionTerms, nodes] =
            wireFields(key);
        const [nodeCount, node] = wireFields(nodes);

        assert.equal(ascii(keyDomain), "f1r3node:phlo-resource:v1");
        assert.equal(hex(keyLocation), hex(location));
        assert.equal(hex(keyClass), hex(beBytes(BigInt(classIndex), 4)));
        assert.equal(hex(acquisitionTerms), hex(signedSchedule));
        assert.equal(hex(nodeCount), "00000001");
        assert.deepEqual(wireFields(node).map(hex), ["01", hex(ground)]);
    });
});

test("a prepared offer and its signature give the same offer as the injected signer", async () => {
    console.log("\n=== TWO-PHASE SIGNING ===");

    const signer: OwnerOfferSigner = signerOf(PRIVATE_KEY_HEX);
    const prepared: PreparedOwnerDirectOffer = prepareOwnerDirectOffer(
        request(),
        signer.publicKey,
        HASHING,
    );
    const finished: OwnerDirectOffer = finishOwnerDirectOffer(
        prepared,
        await signer.sign(prepared.signingHash),
    );
    const injected: OwnerDirectOffer = await createOwnerDirectOffer(
        request(),
        signer,
        HASHING,
    );

    assert.equal(hex(prepared.deployId), injected.deployIdHex);
    assert.equal(hex(prepared.signingHash), hex(injected.signingHash));
    assert.equal(finished.deployDataProtoBase64, injected.deployDataProtoBase64);
    assert.throws(
        () => finishOwnerDirectOffer(prepared, new Uint8Array(64)),
        /non-canonical signature/,
    );
});

test("the same inputs give the same offer bytes", async () => {
    console.log("\n=== DETERMINISM ===");

    const first: OwnerDirectOffer = await createOwnerDirectOffer(
        request(),
        signerOf(PRIVATE_KEY_HEX),
        HASHING,
    );
    const second: OwnerDirectOffer = await createOwnerDirectOffer(
        request(),
        signerOf(PRIVATE_KEY_HEX),
        HASHING,
    );
    const otherTimestamp: OwnerDirectOffer = await createOwnerDirectOffer(
        request({ body: body({ timestamp: TIMESTAMP + 1 }) }),
        signerOf(PRIVATE_KEY_HEX),
        HASHING,
    );
    const otherPolicy: OwnerDirectOffer = await createOwnerDirectOffer(
        request({
            genesisSchedule: decodeResourcePolicyHex(SHIPPED_DEFAULT_POLICY_HEX)
                .schedule,
        }),
        signerOf(PRIVATE_KEY_HEX),
        HASHING,
    );

    assert.equal(first.deployDataProtoBase64, second.deployDataProtoBase64);
    assert.notEqual(first.deployIdHex, otherTimestamp.deployIdHex);
    assert.notEqual(
        first.deployIdHex,
        otherPolicy.deployIdHex,
        "the signed policy enters the deploy ID",
    );
});

test("an owner-direct offer refuses a REV ceiling above a source cap", async () => {
    console.log("\n=== SOURCE CAP ===");

    // 2^64 - 2 = 120494482418 * 153092023, so this ceiling is 2^64 - 1.
    const largestLimit: number = 120494482418;
    const largestPrice: number = 153092023;
    const largest: OwnerDirectOffer = await createOwnerDirectOffer(
        request({ phloLimit: largestLimit, phloPrice: largestPrice }),
        signerOf(PRIVATE_KEY_HEX),
        HASHING,
    );
    const [, base] = wireFields(largest.fundingIntent);
    const [, , , totalExposure] = wireFields(base);

    assert.equal(hex(totalExposure), "0000000000000000ffffffffffffffff");

    const refused: [number, number][] = [
        [MAX_SAFE_INTEGER, MAX_SAFE_INTEGER],
        [largestLimit, largestPrice + 1],
    ];

    for (const [phloLimit, phloPrice] of refused) {
        await assert.rejects(
            createOwnerDirectOffer(
                request({ phloLimit, phloPrice }),
                signerOf(PRIVATE_KEY_HEX),
                HASHING,
            ),
            /owner-direct offer: the REV ceiling exceeds a source cap/,
        );
    }
});

test("an owner-direct offer refuses inputs that protocol v6 refuses", async () => {
    console.log("\n=== INPUT REFUSALS ===");

    const cases: [string, Partial<OwnerOfferRequest>, RegExp][] = [
        [
            "negative valid-after block",
            { body: body({ validAfterBlockNumber: -1 }) },
            /protocol-v6 valid-after block must be nonnegative/,
        ],
        [
            "negative timestamp",
            { body: body({ timestamp: -1 }) },
            /protocol-v6 deploy timestamp must be nonnegative/,
        ],
        [
            "empty shard",
            { body: body({ shardId: "" }) },
            /protocol-v6 shard ID must be nonempty/,
        ],
        [
            "negative expiration",
            { body: body({ expirationTimestamp: -5 }) },
            /protocol-v6 expiration timestamp must be positive/,
        ],
        [
            "fractional phlo limit",
            { phloLimit: 1.5 },
            /the phlo limit must be an integer/,
        ],
    ];

    for (const [name, overrides, error] of cases) {
        console.log("    Refusing:", name);

        await assert.rejects(
            createOwnerDirectOffer(
                request(overrides),
                signerOf(PRIVATE_KEY_HEX),
                HASHING,
            ),
            error,
        );
    }

    const compressed: OwnerOfferSigner = {
        ...signerOf(PRIVATE_KEY_HEX),
        publicKey: getPublicKey(PRIVATE_KEY_HEX, true),
    };

    await assert.rejects(
        createOwnerDirectOffer(request(), compressed, HASHING),
        /non-canonical public key/,
    );
});

test("an owner-direct offer refuses a signature that is not strict low-S DER", async () => {
    console.log("\n=== SIGNATURE REFUSALS ===");

    const signer: OwnerOfferSigner = signerOf(PRIVATE_KEY_HEX);
    const compact: OwnerOfferSigner = {
        ...signer,
        sign: (signingHash: Uint8Array): Promise<Uint8Array> =>
            sign(signingHash, PRIVATE_KEY_HEX, { der: false }),
    };
    const highS: OwnerOfferSigner = {
        ...signer,
        sign: async (signingHash: Uint8Array): Promise<Uint8Array> => {
            const der: Uint8Array = await sign(signingHash, PRIVATE_KEY_HEX);
            const rLength: number = der[3];
            const r: Uint8Array = der.slice(4, 4 + rLength);
            const s: bigint = BigInt("0x" + hex(der.slice(6 + rLength)));
            const flipped: Uint8Array = beBytes(SECP256K1_ORDER - s, 32);
            const sBytes: Uint8Array =
                flipped[0] >= 0x80
                    ? concat([new Uint8Array([0]), flipped])
                    : flipped;

            return concat([
                new Uint8Array([0x30, 4 + r.length + sBytes.length, 0x02, r.length]),
                r,
                new Uint8Array([0x02, sBytes.length]),
                sBytes,
            ]);
        },
    };

    for (const [name, candidate] of [
        ["compact", compact],
        ["high S", highS],
    ] as [string, OwnerOfferSigner][]) {
        console.log("    Refusing:", name);

        await assert.rejects(
            createOwnerDirectOffer(request(), candidate, HASHING),
            /non-canonical signature/,
        );
    }
});

test("the byte helpers agree with the reference codecs", () => {
    console.log("\n=== BYTE HELPERS ===");

    let seed: number = 7;
    const next = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;

        return seed;
    };

    for (let round = 0; round < 200; round += 1) {
        const bytes: Uint8Array = new Uint8Array(next() % 48);

        for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = next() % 256;
        }

        if (round % 5 === 0 && bytes.length > 2) {
            bytes[0] = 0;
            bytes[1] = 0;
        }

        assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString("base64"));
        assert.equal(bytesToBase58(bytes), bs58.encode(bytes));
        assert.equal(bytesToHex(bytes), hex(bytes));

        // A high part below 2^21 and a low part below 2^32 give a safe
        // integer up to 2^53 - 1.
        const safeInteger = (): number =>
            (next() % 2097152) * 4294967296 + (next() * 2 + (next() % 2));
        const left: number = safeInteger();
        const right: number = safeInteger();
        const addend: number = next();

        assert.ok(Number.isSafeInteger(left) && Number.isSafeInteger(right));

        assert.equal(
            hex(u128MultiplyAdd(left, right, addend)),
            hex(beBytes(BigInt(left) * BigInt(right) + BigInt(addend), 16)),
        );
    }

    assert.equal(
        hex(u128MultiplyAdd(MAX_SAFE_INTEGER, MAX_SAFE_INTEGER, MAX_SAFE_INTEGER)),
        hex(
            beBytes(
                BigInt(MAX_SAFE_INTEGER) * BigInt(MAX_SAFE_INTEGER) +
                    BigInt(MAX_SAFE_INTEGER),
                16,
            ),
        ),
    );
});
