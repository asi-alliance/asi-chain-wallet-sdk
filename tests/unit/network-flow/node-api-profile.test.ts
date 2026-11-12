import test from "node:test";
import assert from "node:assert/strict";

import ApiClientManager, { IApiClients } from "@domains/ApiClientManager";
import NodeApiProvider from "@domains/NodeApiProvider";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import RustNodeApiAdapter, {
    DeployFinalizationState,
} from "@domains/NodeApiAdapter/Rust";
import ScalaNodeApiAdapter from "@domains/NodeApiAdapter/Scala";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { INetworkContext } from "@domains/Network";
import { DeployStatus, IDeployStatusResult } from "@domains/Deploy";
import { IGetBlocksParams } from "@domains/ObserverClient";
import { createNodeApiAdapter } from "@fabrics/nodeApiAdapter";
import DeployStatusPoller from "@services/DeployStatusPoller";
import ReservationAdapter from "@domains/ReservationAdapter";
import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE, GasFee } from "@config/index";
import { MAX_UINT256 } from "@utils/constants";
import { NETWORKS_CONFIG, RUST_NETWORK, SCALA_NETWORK } from "./networks";

interface IExploreCall {
    client: string;
    body: unknown;
}

interface IRustBlockNumberCase {
    blockNumber: unknown;
    expected: number;
}

const LATEST_BLOCK_NUMBER: number = 42;

const WIDE_PHLO_PRICE: bigint = 9007199254740993n;
const MAX_PHLO_CHARGE: bigint = 3n * WIDE_PHLO_PRICE;

const INVALID_BLOCK_NUMBER_ERROR: RegExp =
    /Block number must be a non-negative safe integer/;

const INVALID_TRANSFER_PHLO_PRICE_ERROR: RegExp =
    /ReservationAdapter\.getTransferGasReserve: Phlo price must be a positive integer not greater than/;

const DEPLOY_ID: string = "3044022012ab";
const BLOCK_HASH: string = "bcd950e8b296";

const RUST_DEPLOY_NOT_FOUND = {
    error: "deploy_not_found",
    message: `Couldn't find block containing deploy with id: ${DEPLOY_ID}`,
};

const RUST_PENDING_DEPLOY = {
    deployId: DEPLOY_ID,
    blockHash: BLOCK_HASH,
    blockNumber: 524,
    isFinalized: false,
    finalizationState: DeployFinalizationState.PENDING,
};

const RUST_FINALIZED_DEPLOY = {
    ...RUST_PENDING_DEPLOY,
    isFinalized: true,
    finalizationState: DeployFinalizationState.FINALIZED,
};

const RUST_FINALIZED_BLOCK_DEPLOY = {
    ...RUST_PENDING_DEPLOY,
    isFinalized: true,
};

const RUST_FAILED_DEPLOY = {
    ...RUST_PENDING_DEPLOY,
    isFinalized: true,
    finalizationState: DeployFinalizationState.FAILED,
};

const createBlocksClients = (
    blocks: unknown[],
    calls: (IGetBlocksParams | undefined)[],
): IApiClients =>
    ({
        observer: {
            getBlocks: async (params?: IGetBlocksParams) => {
                calls.push(params);

                return blocks;
            },
        },
    }) as unknown as IApiClients;

const createDeployClients = (deploy: unknown): IApiClients =>
    ({
        observer: {
            getDeploy: async () => deploy,
        },
    }) as unknown as IApiClients;

const readDeployStatus = async (
    profile: NodeApiProfile,
    deploy: unknown,
): Promise<DeployStatus> => {
    const result: IDeployStatusResult = await createNodeApiAdapter(
        profile,
        createDeployClients(deploy),
    ).getDeployStatus(DEPLOY_ID);

    return result.status;
};

const readRustLatestBlockNumber = (blocks: unknown[]): Promise<number> =>
    createNodeApiAdapter(
        NodeApiProfile.RUST,
        createBlocksClients(blocks, []),
    ).getLatestBlockNumber();

const createStubClients = (calls: IExploreCall[]): IApiClients => {
    const createStub = (name: string) => ({
        submitExploratoryDeploy: async (body: unknown) => {
            calls.push({ client: name, body });

            return { expr: [] };
        },
    });

    return {
        validator: createStub("validator"),
        observer: createStub("observer"),
        indexer: createStub("indexer"),
    } as unknown as IApiClients;
};

const initApiClientManager = (defaultNetwork: string): ApiClientManager => {
    const apiClientManager: ApiClientManager = ApiClientManager.getInstance();

    apiClientManager.close();
    apiClientManager.initialize(NETWORKS_CONFIG, [], defaultNetwork);

    return apiClientManager;
};

console.log("\n[TEST NETWORKS]");
console.log("    Scala network:", SCALA_NETWORK);
console.log("    Rust network:", RUST_NETWORK);

test("adapter fabric builds the adapter of the requested profile", () => {
    console.log("\n=== ADAPTER FABRIC PER PROFILE ===");

    const clients: IApiClients = createStubClients([]);

    const scalaAdapter: NodeApiAdapter = createNodeApiAdapter(
        NodeApiProfile.SCALA,
        clients,
    );

    const rustAdapter: NodeApiAdapter = createNodeApiAdapter(
        NodeApiProfile.RUST,
        clients,
    );

    console.log("    Scala adapter class:", scalaAdapter.constructor.name);
    console.log("    Scala adapter profile:", scalaAdapter.getProfile());
    console.log("    Rust adapter class:", rustAdapter.constructor.name);
    console.log("    Rust adapter profile:", rustAdapter.getProfile());

    assert.ok(scalaAdapter instanceof ScalaNodeApiAdapter);
    assert.ok(rustAdapter instanceof RustNodeApiAdapter);
    assert.equal(scalaAdapter.getProfile(), NodeApiProfile.SCALA);
    assert.equal(rustAdapter.getProfile(), NodeApiProfile.RUST);
});

test("scala profile sends exploratory deploy to the observer as a raw term", async () => {
    console.log("\n=== SCALA EXPLORATORY DEPLOY SHAPE ===");

    const calls: IExploreCall[] = [];

    const adapter: NodeApiAdapter = createNodeApiAdapter(
        NodeApiProfile.SCALA,
        createStubClients(calls),
    );

    await adapter.exploreDeploy("Nil");

    console.log("    Calls:", JSON.stringify(calls));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].client, "observer");
    assert.equal(calls[0].body, "Nil");
});

test("rust profile sends exploratory deploy to the observer as a json term", async () => {
    console.log("\n=== RUST EXPLORATORY DEPLOY SHAPE ===");

    const calls: IExploreCall[] = [];

    const adapter: NodeApiAdapter = createNodeApiAdapter(
        NodeApiProfile.RUST,
        createStubClients(calls),
    );

    await adapter.exploreDeploy("Nil");

    console.log("    Calls:", JSON.stringify(calls));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].client, "observer");
    assert.deepEqual(calls[0].body, { term: "Nil" });
});

test("scala profile keeps classic phlo pricing and the fixed transfer gas reserve", () => {
    console.log("\n=== SCALA PHLO PRICING ===");

    const adapter: NodeApiAdapter = createNodeApiAdapter(
        NodeApiProfile.SCALA,
        createStubClients([]),
    );

    console.log("    Max phlo price:", adapter.getMaxPhloPrice().toString());
    console.log(
        "    Transfer gas reserve:",
        adapter.getTransferGasReserve(MAX_PHLO_CHARGE).toString(),
    );

    assert.equal(adapter.getMaxPhloPrice(), BigInt(Number.MAX_SAFE_INTEGER));
    assert.equal(adapter.toDeployPhloPrice(42n), 42);
    assert.equal(adapter.getTransferGasReserve(MAX_PHLO_CHARGE), GasFee.MAX);
});

test("rust profile prices phlo as uint256 and reserves the maximum transfer charge", () => {
    console.log("\n=== RUST PHLO PRICING ===");

    const adapter: NodeApiAdapter = createNodeApiAdapter(
        NodeApiProfile.RUST,
        createStubClients([]),
    );

    console.log("    Max phlo price:", adapter.getMaxPhloPrice().toString());
    console.log(
        "    Transfer gas reserve:",
        adapter.getTransferGasReserve(MAX_PHLO_CHARGE).toString(),
    );

    assert.equal(adapter.getMaxPhloPrice(), MAX_UINT256);
    assert.equal(
        adapter.toDeployPhloPrice(WIDE_PHLO_PRICE),
        WIDE_PHLO_PRICE.toString(),
    );
    assert.equal(
        adapter.getTransferGasReserve(MAX_PHLO_CHARGE),
        MAX_PHLO_CHARGE,
    );
});

test("scala profile reads the flat latest block number with the default blocks request", async () => {
    console.log("\n=== SCALA LATEST BLOCK NUMBER ===");

    const calls: (IGetBlocksParams | undefined)[] = [];

    const adapter: NodeApiAdapter = createNodeApiAdapter(
        NodeApiProfile.SCALA,
        createBlocksClients(
            [{ blockInfo: "", blockNumber: LATEST_BLOCK_NUMBER }],
            calls,
        ),
    );

    const blockNumber: number = await adapter.getLatestBlockNumber();

    console.log("    Blocks request params:", calls[0]);
    console.log("    Latest block number:", blockNumber);

    assert.equal(blockNumber, LATEST_BLOCK_NUMBER);
    assert.deepEqual(calls, [undefined]);
});

test("rust profile reads the latest block number from the summary block envelope", async () => {
    console.log("\n=== RUST LATEST BLOCK NUMBER ===");

    const calls: (IGetBlocksParams | undefined)[] = [];

    const adapter: NodeApiAdapter = createNodeApiAdapter(
        NodeApiProfile.RUST,
        createBlocksClients(
            [{ blockInfo: { blockNumber: String(LATEST_BLOCK_NUMBER) } }],
            calls,
        ),
    );

    const blockNumber: number = await adapter.getLatestBlockNumber();

    console.log("    Blocks request params:", JSON.stringify(calls[0]));
    console.log("    Latest block number:", blockNumber);

    assert.equal(blockNumber, LATEST_BLOCK_NUMBER);
    assert.deepEqual(calls, [{ view: "summary" }]);
});

test("rust profile does not read the flat block number", async () => {
    console.log("\n=== RUST FLAT BLOCK NUMBER ===");

    await assert.rejects(
        readRustLatestBlockNumber([
            { blockInfo: "", blockNumber: LATEST_BLOCK_NUMBER },
        ]),
        INVALID_BLOCK_NUMBER_ERROR,
    );

    console.log("    Flat block number rejected");
});

test("rust profile accepts safe non-negative block numbers as numbers and strings", async () => {
    console.log("\n=== RUST VALID BLOCK NUMBERS ===");

    const cases: IRustBlockNumberCase[] = [
        { blockNumber: LATEST_BLOCK_NUMBER, expected: LATEST_BLOCK_NUMBER },
        {
            blockNumber: String(LATEST_BLOCK_NUMBER),
            expected: LATEST_BLOCK_NUMBER,
        },
        { blockNumber: 0, expected: 0 },
        { blockNumber: "0", expected: 0 },
        {
            blockNumber: Number.MAX_SAFE_INTEGER,
            expected: Number.MAX_SAFE_INTEGER,
        },
        {
            blockNumber: String(Number.MAX_SAFE_INTEGER),
            expected: Number.MAX_SAFE_INTEGER,
        },
    ];

    for (const { blockNumber, expected } of cases) {
        const latestBlockNumber: number = await readRustLatestBlockNumber([
            { blockInfo: { blockNumber } },
        ]);

        console.log("    Accepted:", JSON.stringify(blockNumber));

        assert.equal(latestBlockNumber, expected);
    }
});

test("rust profile rejects block numbers that are not safe non-negative integers", async () => {
    console.log("\n=== RUST INVALID BLOCK NUMBERS ===");

    const invalidBlockNumbers: unknown[] = [
        undefined,
        null,
        true,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        "",
        "-1",
        "1.5",
        "1e3",
        String(Number.MAX_SAFE_INTEGER + 1),
    ];

    for (const blockNumber of invalidBlockNumbers) {
        console.log("    Rejecting:", JSON.stringify(blockNumber));

        await assert.rejects(
            readRustLatestBlockNumber([{ blockInfo: { blockNumber } }]),
            INVALID_BLOCK_NUMBER_ERROR,
        );
    }

    await assert.rejects(
        readRustLatestBlockNumber([]),
        INVALID_BLOCK_NUMBER_ERROR,
    );
});

test("rust profile reads deploy finalization from the deploy finalization state", async () => {
    console.log("\n=== RUST DEPLOY FINALIZATION ===");

    const notFoundStatus: DeployStatus = await readDeployStatus(
        NodeApiProfile.RUST,
        RUST_DEPLOY_NOT_FOUND,
    );
    const pendingStatus: DeployStatus = await readDeployStatus(
        NodeApiProfile.RUST,
        RUST_PENDING_DEPLOY,
    );
    const finalizedBlockStatus: DeployStatus = await readDeployStatus(
        NodeApiProfile.RUST,
        RUST_FINALIZED_BLOCK_DEPLOY,
    );
    const failedStatus: DeployStatus = await readDeployStatus(
        NodeApiProfile.RUST,
        RUST_FAILED_DEPLOY,
    );
    const finalizedStatus: DeployStatus = await readDeployStatus(
        NodeApiProfile.RUST,
        RUST_FINALIZED_DEPLOY,
    );
    const faultToleranceStatus: DeployStatus = await readDeployStatus(
        NodeApiProfile.RUST,
        { blockHash: BLOCK_HASH, faultTolerance: 1 },
    );

    console.log("    Not found:", notFoundStatus);
    console.log("    Pending:", pendingStatus);
    console.log("    Finalized block, pending deploy:", finalizedBlockStatus);
    console.log("    Finalized block, failed deploy:", failedStatus);
    console.log("    Finalized deploy:", finalizedStatus);
    console.log("    Fault tolerance only:", faultToleranceStatus);

    assert.equal(notFoundStatus, DeployStatus.DEPLOYING);
    assert.equal(pendingStatus, DeployStatus.INCLUDED_IN_BLOCK);
    assert.equal(finalizedBlockStatus, DeployStatus.INCLUDED_IN_BLOCK);
    assert.equal(failedStatus, DeployStatus.INCLUDED_IN_BLOCK);
    assert.equal(finalizedStatus, DeployStatus.FINALIZED);
    assert.equal(faultToleranceStatus, DeployStatus.INCLUDED_IN_BLOCK);
});

test("scala profile keeps reading deploy finalization from fault tolerance", async () => {
    console.log("\n=== SCALA DEPLOY FINALIZATION ===");

    const finalizedStatus: DeployStatus = await readDeployStatus(
        NodeApiProfile.SCALA,
        { blockHash: BLOCK_HASH, faultTolerance: 0.99 },
    );
    const includedStatus: DeployStatus = await readDeployStatus(
        NodeApiProfile.SCALA,
        {
            blockHash: BLOCK_HASH,
            faultTolerance: 0.5,
            finalizationState: DeployFinalizationState.FINALIZED,
        },
    );

    console.log("    Fault tolerance 0.99:", finalizedStatus);
    console.log("    Fault tolerance 0.5 with Finalized state:", includedStatus);

    assert.equal(finalizedStatus, DeployStatus.FINALIZED);
    assert.equal(includedStatus, DeployStatus.INCLUDED_IN_BLOCK);
});

test("node api provider follows the active network profile", () => {
    console.log("\n=== PROVIDER FOLLOWS ACTIVE NETWORK ===");

    const apiClientManager: ApiClientManager =
        initApiClientManager(SCALA_NETWORK);

    const nodeApiProvider: NodeApiProvider =
        NodeApiProvider.getInstance(apiClientManager);

    const beforeSwitch: NodeApiProfile = nodeApiProvider.getApi().getProfile();

    apiClientManager.switchNetwork(RUST_NETWORK);

    const afterSwitch: NodeApiProfile = nodeApiProvider.getApi().getProfile();

    console.log("    Profile before switch:", beforeSwitch);
    console.log("    Profile after switch:", afterSwitch);

    assert.equal(beforeSwitch, NodeApiProfile.SCALA);
    assert.equal(afterSwitch, NodeApiProfile.RUST);

    apiClientManager.close();
});

test("transfer gas reserve follows the active network profile", () => {
    console.log("\n=== TRANSFER GAS RESERVE FOLLOWS ACTIVE NETWORK ===");

    const apiClientManager: ApiClientManager =
        initApiClientManager(SCALA_NETWORK);

    NodeApiProvider.getInstance(apiClientManager);

    const scalaDefaultReserve: bigint =
        ReservationAdapter.getTransferGasReserve();
    const scalaPhloReserve: bigint = ReservationAdapter.getTransferGasReserve({
        phloLimit: 3,
        phloPrice: 2,
    });

    apiClientManager.switchNetwork(RUST_NETWORK);

    const rustDefaultReserve: bigint =
        ReservationAdapter.getTransferGasReserve();
    const rustWideReserve: bigint = ReservationAdapter.getTransferGasReserve({
        phloLimit: 3,
        phloPrice: WIDE_PHLO_PRICE,
    });

    console.log("    Scala default reserve:", scalaDefaultReserve.toString());
    console.log("    Scala reserve with phlo:", scalaPhloReserve.toString());
    console.log("    Rust default reserve:", rustDefaultReserve.toString());
    console.log("    Rust wide reserve:", rustWideReserve.toString());

    assert.equal(scalaDefaultReserve, GasFee.MAX);
    assert.equal(scalaPhloReserve, GasFee.MAX);
    assert.equal(
        rustDefaultReserve,
        BigInt(DEFAULT_PHLO_LIMIT) * BigInt(DEFAULT_PHLO_PRICE),
    );
    assert.equal(rustWideReserve, MAX_PHLO_CHARGE);

    apiClientManager.close();
});

test("transfer gas reserve rejects phlo prices outside the active network bounds", () => {
    console.log("\n=== TRANSFER GAS RESERVE REJECTS INVALID PHLO ===");

    const apiClientManager: ApiClientManager =
        initApiClientManager(SCALA_NETWORK);

    NodeApiProvider.getInstance(apiClientManager);

    assert.throws(
        () =>
            ReservationAdapter.getTransferGasReserve({
                phloPrice: WIDE_PHLO_PRICE,
            }),
        INVALID_TRANSFER_PHLO_PRICE_ERROR,
    );

    apiClientManager.switchNetwork(RUST_NETWORK);

    assert.throws(
        () => ReservationAdapter.getTransferGasReserve({ phloPrice: 0 }),
        INVALID_TRANSFER_PHLO_PRICE_ERROR,
    );
    assert.throws(
        () => ReservationAdapter.getTransferGasReserve({ phloPrice: "1.5" }),
        INVALID_TRANSFER_PHLO_PRICE_ERROR,
    );

    apiClientManager.close();
});

test("network context can be built for a network that is not active", () => {
    console.log("\n=== CONTEXT FOR A NON ACTIVE NETWORK ===");

    const apiClientManager: ApiClientManager =
        initApiClientManager(SCALA_NETWORK);

    const activeContext: INetworkContext =
        apiClientManager.createNetworkContext();

    const foreignContext: INetworkContext =
        apiClientManager.createNetworkContext(RUST_NETWORK);

    console.log("    Active context network:", activeContext.networkId);
    console.log("    Active context profile:", activeContext.api.getProfile());
    console.log("    Foreign context network:", foreignContext.networkId);
    console.log(
        "    Foreign context profile:",
        foreignContext.api.getProfile(),
    );

    assert.equal(activeContext.networkId, SCALA_NETWORK);
    assert.equal(activeContext.api.getProfile(), NodeApiProfile.SCALA);
    assert.equal(foreignContext.networkId, RUST_NETWORK);
    assert.equal(foreignContext.api.getProfile(), NodeApiProfile.RUST);
    assert.equal(
        foreignContext.config.ValidatorURL,
        NETWORKS_CONFIG[RUST_NETWORK].ValidatorURL,
    );

    apiClientManager.close();
});

test("network context is a snapshot and survives a network switch", () => {
    console.log("\n=== CONTEXT IS A SNAPSHOT ===");

    const apiClientManager: ApiClientManager =
        initApiClientManager(SCALA_NETWORK);

    const context: INetworkContext = apiClientManager.createNetworkContext();
    const capturedApi: NodeApiAdapter = context.api;

    apiClientManager.switchNetwork(RUST_NETWORK);

    console.log(
        "    Manager network after switch:",
        apiClientManager.getCurrentNetworkId(),
    );
    console.log("    Context network:", context.networkId);
    console.log("    Context profile:", context.api.getProfile());
    console.log(
        "    Context clients replaced by switch:",
        context.clients.validator !== apiClientManager.getClients().validator,
    );

    assert.equal(apiClientManager.getCurrentNetworkId(), RUST_NETWORK);
    assert.equal(context.networkId, SCALA_NETWORK);
    assert.equal(context.api, capturedApi);
    assert.equal(context.api.getProfile(), NodeApiProfile.SCALA);
    assert.notEqual(
        context.clients.validator,
        apiClientManager.getClients().validator,
    );

    apiClientManager.close();
});

test("deploy status poller keeps its own network context after a switch", () => {
    console.log("\n=== POLLER KEEPS ITS NETWORK ===");

    const apiClientManager: ApiClientManager =
        initApiClientManager(SCALA_NETWORK);

    const context: INetworkContext = apiClientManager.createNetworkContext();
    const poller: DeployStatusPoller = new DeployStatusPoller(context);

    apiClientManager.switchNetwork(RUST_NETWORK);

    console.log("    Active network:", apiClientManager.getCurrentNetworkId());
    console.log("    Poller network:", poller.getNetworkId());
    console.log("    Poller profile:", poller.getNodeApiProfile());
    console.log("    Poller api profile:", poller.getApi().getProfile());

    assert.equal(apiClientManager.getCurrentNetworkId(), RUST_NETWORK);
    assert.equal(poller.getNetworkId(), SCALA_NETWORK);
    assert.equal(poller.getNodeApiProfile(), NodeApiProfile.SCALA);
    assert.equal(poller.getApi(), context.api);
    assert.equal(poller.getApi().getProfile(), NodeApiProfile.SCALA);

    apiClientManager.close();
});

test("network context for an unknown network throws", () => {
    console.log("\n=== CONTEXT FOR AN UNKNOWN NETWORK ===");

    const apiClientManager: ApiClientManager =
        initApiClientManager(SCALA_NETWORK);

    assert.throws(() => apiClientManager.createNetworkContext("ghost-network"));

    console.log("    Unknown network rejected");

    apiClientManager.close();
});
