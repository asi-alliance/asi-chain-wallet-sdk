import test from "node:test";
import assert from "node:assert/strict";
import { verify } from "@noble/secp256k1";
import blakejs from "blakejs";

import Account from "@domains/Account";
import { IApiClients } from "@domains/ApiClientManager";
import Bip44Path from "@domains/Bip44Path";
import { DeployData } from "@domains/Deploy";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import ScalaNodeApiAdapter from "@domains/NodeApiAdapter/Scala";
import NodeApiProvider from "@domains/NodeApiProvider";
import SecretsProvider from "@domains/SecretsProvider";
import Signer, { WalletTypes } from "@domains/Signer";
import BlockService from "@services/BlockService";
import DeployService from "@services/DeployService";
import KeysManager from "@services/KeysManager";
import MnemonicService from "@services/Mnemonic";
import SignerService, { SignedResult } from "@services/Signer";
import TransactionService, {
    TDeployDetails,
} from "@services/TransactionService";
import { createSigner } from "@fabrics/signer";
import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "@config/index";
import { encodeBase16 } from "@utils/index";
import { ASI_COIN_TYPE } from "@utils/constants";

const { blake2bHex } = blakejs;

const PASSWORD = "sign-deploy-password";
const TERM = "new lock in { lock!(42) }";
const LATEST_BLOCK_NUMBER = 100;
const HD_ACCOUNT_INDEX = 3;
const DEPLOY_HASH_LENGTH = 32;
const DEFAULT_SHARD_ID = "root";

interface ISigningContext {
    account: Account;
    signer: Signer;
}

interface IInvalidPayloadCase {
    name: string;
    details: TDeployDetails;
    error: RegExp;
}

interface IClassicSerializationCase {
    name: string;
    data: DeployData;
    protobufHex: string;
}

const CLASSIC_TERM = "new return in { return!(42) }";
const CLASSIC_TIMESTAMP = 1760000000123;

const CLASSIC_TERM_HEX =
    "121d6e65772072657475726e20696e207b2072657475726e2128343229207d";
const CLASSIC_TIMESTAMP_HEX = "18fb80b3c19c33";
const CLASSIC_ROOT_SHARD_HEX = "5a04726f6f74";

const CLASSIC_SERIALIZATION_CASES: IClassicSerializationCase[] = [
    {
        name: "minimal price and limit",
        data: {
            term: CLASSIC_TERM,
            timestamp: CLASSIC_TIMESTAMP,
            phloPrice: 1,
            phloLimit: 1,
            validAfterBlockNumber: 99,
            shardId: "root",
        },
        protobufHex: `${CLASSIC_TERM_HEX}${CLASSIC_TIMESTAMP_HEX}380140015063${CLASSIC_ROOT_SHARD_HEX}`,
    },
    {
        name: "multi byte price and limit",
        data: {
            term: CLASSIC_TERM,
            timestamp: CLASSIC_TIMESTAMP,
            phloPrice: 1000,
            phloLimit: 500000,
            validAfterBlockNumber: 99,
            shardId: "root",
        },
        protobufHex: `${CLASSIC_TERM_HEX}${CLASSIC_TIMESTAMP_HEX}38e80740a0c21e5063${CLASSIC_ROOT_SHARD_HEX}`,
    },
    {
        name: "genesis previous block",
        data: {
            term: CLASSIC_TERM,
            timestamp: CLASSIC_TIMESTAMP,
            phloPrice: 1,
            phloLimit: 1,
            validAfterBlockNumber: -1,
            shardId: "root",
        },
        protobufHex: `${CLASSIC_TERM_HEX}${CLASSIC_TIMESTAMP_HEX}3801400150ffffffffffffffffff01${CLASSIC_ROOT_SHARD_HEX}`,
    },
];

const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

class StubBlockService extends BlockService {
    public async getLatestBlockNumber(): Promise<number> {
        return LATEST_BLOCK_NUMBER;
    }
}

class SpyDeployService extends DeployService {
    public readonly submitted: SignedResult[] = [];

    public async submitSignedDeploy(
        deploy: SignedResult,
    ): Promise<string | undefined> {
        this.submitted.push(deploy);

        return deploy.signature;
    }
}

const createPasswordProvider = (): SecretsProvider =>
    new SecretsProvider(() => ({ password: PASSWORD }));

const createRootHDPath = (): Bip44Path =>
    new Bip44Path({
        coinType: ASI_COIN_TYPE,
        account: 0,
        change: 0,
        index: 0,
    });

const createPrivateKeyContext = async (): Promise<ISigningContext> => {
    const { privateKey }: { privateKey: Uint8Array } =
        KeysManager.generateKeyPair();

    const signer: Signer = await createSigner({
        id: "pk-signer",
        type: WalletTypes.PRIVATE_KEY,
        secretProvider: new SecretsProvider(() => ({
            password: PASSWORD,
            secret: { privateKey },
        })),
    });

    const account: Account = await Account.create(
        { name: "pk-account" },
        new SecretsProvider(() => ({ privateKey })),
    );

    return { account, signer };
};

const createHDContext = async (index: number): Promise<ISigningContext> => {
    const seed: string = MnemonicService.generateMnemonic();

    const signer: Signer = await createSigner({
        id: "hd-signer",
        type: WalletTypes.HD,
        secretProvider: new SecretsProvider(() => ({
            password: PASSWORD,
            secret: { seed, rootHDPath: createRootHDPath().toString() },
        })),
    });

    const account: Account = await Account.create(
        { name: "hd-account", index },
        new SecretsProvider(() => ({ seed, rootHDPath: createRootHDPath() })),
    );

    return { account, signer };
};

const scalaApi: NodeApiAdapter = new ScalaNodeApiAdapter({} as IApiClients);

const createTransactionService = (
    deployService: DeployService = new SpyDeployService(),
): TransactionService =>
    new TransactionService(deployService, new StubBlockService(), {
        getApi: () => scalaApi,
    } as unknown as NodeApiProvider);

const hashSignedData = (signed: SignedResult): string =>
    blake2bHex(
        SignerService.deployDataProtobufSerialize(signed.data),
        undefined,
        DEPLOY_HASH_LENGTH,
    );

test("signDeploy signs exactly the deploy data it reports", async () => {
    console.log("\n=== SIGNATURE COVERS THE RETURNED DATA ===");

    const { account, signer }: ISigningContext =
        await createPrivateKeyContext();

    const signed: SignedResult = await createTransactionService().signDeploy({
        walletType: WalletTypes.PRIVATE_KEY,
        account,
        signer,
        term: TERM,
        passwordProvider: createPasswordProvider(),
    });

    const hash: string = hashSignedData(signed);

    console.log("    Deployer:", signed.deployer);
    console.log("    Deploy hash:", hash);

    assert.equal(signed.sigAlgorithm, "secp256k1");
    assert.equal(signed.deployer, encodeBase16(account.getPublicKey()));
    assert.equal(verify(signed.signature, hash, signed.deployer), true);
});

test("signDeploy fills the deploy defaults and pins the previous block", async () => {
    console.log("\n=== DEFAULTS ARE APPLIED ===");

    const { account, signer }: ISigningContext =
        await createPrivateKeyContext();

    const signed: SignedResult = await createTransactionService().signDeploy({
        walletType: WalletTypes.PRIVATE_KEY,
        account,
        signer,
        term: TERM,
        passwordProvider: createPasswordProvider(),
    });

    console.log("    Signed data:", JSON.stringify(signed.data));

    assert.equal(signed.data.term, TERM);
    assert.equal(signed.data.phloLimit, DEFAULT_PHLO_LIMIT);
    assert.equal(signed.data.phloPrice, DEFAULT_PHLO_PRICE);
    assert.equal(signed.data.shardId, DEFAULT_SHARD_ID);
    assert.equal(signed.data.validAfterBlockNumber, LATEST_BLOCK_NUMBER - 1);
    assert.equal(typeof signed.data.timestamp, "number");
});

test("signDeploy keeps the deploy settings passed by the caller", async () => {
    console.log("\n=== CALLER SETTINGS ARE KEPT ===");

    const { account, signer }: ISigningContext =
        await createPrivateKeyContext();

    const signed: SignedResult = await createTransactionService().signDeploy({
        walletType: WalletTypes.PRIVATE_KEY,
        account,
        signer,
        term: TERM,
        phloLimit: 5_000_000_000,
        phloPrice: 2,
        shardId: "bridge",
        passwordProvider: createPasswordProvider(),
    });

    console.log("    Signed data:", JSON.stringify(signed.data));

    assert.equal(signed.data.phloLimit, 5_000_000_000);
    assert.equal(signed.data.phloPrice, 2);
    assert.equal(signed.data.shardId, "bridge");
    assert.equal(
        verify(signed.signature, hashSignedData(signed), signed.deployer),
        true,
    );
});

test("signDeploy signs with the key of the requested hd account index", async () => {
    console.log("\n=== HD INDEX IS RESOLVED INSIDE THE SDK ===");

    const { account, signer }: ISigningContext =
        await createHDContext(HD_ACCOUNT_INDEX);

    const signed: SignedResult = await createTransactionService().signDeploy({
        walletType: WalletTypes.HD,
        account,
        signer,
        term: TERM,
        passwordProvider: createPasswordProvider(),
    });

    console.log("    Account index:", account.getIndex());
    console.log("    Deployer:", signed.deployer);

    assert.equal(account.getIndex(), HD_ACCOUNT_INDEX);
    assert.equal(signed.deployer, encodeBase16(account.getPublicKey()));
    assert.equal(
        verify(signed.signature, hashSignedData(signed), signed.deployer),
        true,
    );
});

test("signDeploy never submits the deploy", async () => {
    console.log("\n=== SIGNING DOES NOT SUBMIT ===");

    const deployService: SpyDeployService = new SpyDeployService();
    const { account, signer }: ISigningContext =
        await createPrivateKeyContext();

    await createTransactionService(deployService).signDeploy({
        walletType: WalletTypes.PRIVATE_KEY,
        account,
        signer,
        term: TERM,
        passwordProvider: createPasswordProvider(),
    });

    console.log("    Submitted deploys:", deployService.submitted.length);

    assert.equal(deployService.submitted.length, 0);
});

test("scala adapter serializes deploy data into the classic protobuf bytes", () => {
    console.log("\n=== SCALA CLASSIC SERIALIZATION ===");

    for (const { name, data, protobufHex } of CLASSIC_SERIALIZATION_CASES) {
        const bytes: Uint8Array = scalaApi.serializeDeployData(data);

        console.log("    Case:", name);
        console.log("    Protobuf:", toHex(bytes));

        assert.equal(toHex(bytes), protobufHex);
    }
});

test("classic deploy serializer keeps the protobuf bytes", () => {
    console.log("\n=== CLASSIC SERIALIZER ===");

    for (const { name, data, protobufHex } of CLASSIC_SERIALIZATION_CASES) {
        const bytes: Uint8Array =
            SignerService.deployDataProtobufSerialize(data);

        console.log("    Case:", name);

        assert.equal(toHex(bytes), protobufHex);
    }
});

test("signDeploy rejects an invalid payload", async () => {
    console.log("\n=== INVALID PAYLOADS ARE REJECTED ===");

    const cases: IInvalidPayloadCase[] = [
        {
            name: "blank term",
            details: { term: "   " },
            error: /Deploy term must not be empty/,
        },
        {
            name: "zero phlo limit",
            details: { term: TERM, phloLimit: 0 },
            error: /Phlo limit must be a positive safe integer/,
        },
        {
            name: "fractional phlo limit",
            details: { term: TERM, phloLimit: 1.5 },
            error: /Phlo limit must be a positive safe integer/,
        },
        {
            name: "phlo price that is not a number",
            details: { term: TERM, phloPrice: Number.NaN },
            error: /Phlo price must be a positive integer/,
        },
        {
            name: "phlo price above the classic range",
            details: { term: TERM, phloPrice: 1n << 60n },
            error: /Phlo price must be a positive integer not greater than 9007199254740991/,
        },
        {
            name: "blank shard id",
            details: { term: TERM, shardId: " " },
            error: /Shard id must not be empty/,
        },
    ];

    const deployService: SpyDeployService = new SpyDeployService();
    const transactionService: TransactionService =
        createTransactionService(deployService);
    const { account, signer }: ISigningContext =
        await createPrivateKeyContext();

    for (const { name, details, error } of cases) {
        console.log("    Rejecting:", name);

        await assert.rejects(
            transactionService.signDeploy({
                walletType: WalletTypes.PRIVATE_KEY,
                account,
                signer,
                ...details,
                passwordProvider: createPasswordProvider(),
            }),
            error,
        );
    }

    assert.equal(deployService.submitted.length, 0);
});
