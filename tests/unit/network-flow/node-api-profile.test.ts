import test from "node:test";
import assert from "node:assert/strict";

import ApiClientManager, { IApiClients } from "@domains/ApiClientManager";
import NodeApiProvider from "@domains/NodeApiProvider";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import RustNodeApiAdapter from "@domains/NodeApiAdapter/Rust";
import ScalaNodeApiAdapter from "@domains/NodeApiAdapter/Scala";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { INetworkContext } from "@domains/Network";
import { IGetBlocksParams } from "@domains/ObserverClient";
import { createNodeApiAdapter } from "@fabrics/nodeApiAdapter";
import DeployStatusPoller from "@services/DeployStatusPoller";
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

const INVALID_BLOCK_NUMBER_ERROR: RegExp =
    /Block number must be a non-negative safe integer/;

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
