import test from "node:test";
import assert from "node:assert/strict";

import ApiClientManager, { IApiClients } from "@domains/ApiClientManager";
import NodeApiProvider from "@domains/NodeApiProvider";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import RustNodeApiAdapter from "@domains/NodeApiAdapter/Rust";
import ScalaNodeApiAdapter from "@domains/NodeApiAdapter/Scala";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { INetworkContext } from "@domains/Network";
import { createNodeApiAdapter } from "@utils/fabrics/nodeApiAdapter";
import DeployStatusPoller from "@services/DeployStatusPoller";
import { NETWORKS_CONFIG, RUST_NETWORK, SCALA_NETWORK } from "./networks";

interface IExploreCall {
    client: string;
    body: unknown;
}

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

console.log("\n[NETWORKS FROM .env]");
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

test("scala profile sends exploratory deploy to the validator as a raw term", async () => {
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
