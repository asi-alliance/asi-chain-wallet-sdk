import test from "node:test";
import assert from "node:assert/strict";

import ApiClientManager from "@domains/ApiClientManager";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { INetworkConfig, INetworkRecord } from "@domains/Network";
import {
    CUSTOM_NETWORK_CONFIG,
    NETWORKS_CONFIG,
    RUST_NETWORK,
    SCALA_NETWORK,
} from "./networks";

const CUSTOM_NETWORK: string = "Custom network";

const SECOND_CUSTOM_NETWORK: string = "Second custom network";

const SECOND_CUSTOM_NETWORK_CONFIG: INetworkConfig = {
    ValidatorURL: "http://second-validator.test:40413",
    ReadOnlyURL: "http://second-observer.test:40453",
    IndexerURL: "http://second-indexer.test:8080/v1/graphql",
    nodeApiProfile: NodeApiProfile.RUST,
};

const SAME_CONFIG_ERROR: RegExp = /Network with the same config already exists/;

const SAME_NAME_ERROR: RegExp = /Network with the same name already exists/;

const initApiClientManager = (): ApiClientManager => {
    const apiClientManager: ApiClientManager = ApiClientManager.getInstance();

    apiClientManager.close();
    apiClientManager.initialize(NETWORKS_CONFIG, [], SCALA_NETWORK);

    return apiClientManager;
};

console.log("\n[TEST NETWORKS]");
console.log("    Default networks:", SCALA_NETWORK, RUST_NETWORK);
console.log("    Custom networks:", CUSTOM_NETWORK, SECOND_CUSTOM_NETWORK);

test("adding a network with the config of a default network throws", () => {
    console.log("\n=== ADD WITH DEFAULT NETWORK CONFIG ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    assert.throws(
        () =>
            apiClientManager.addNetwork(
                CUSTOM_NETWORK,
                NETWORKS_CONFIG[RUST_NETWORK],
            ),
        SAME_CONFIG_ERROR,
    );

    console.log("    Duplicate of the default config rejected");

    assert.equal(apiClientManager.getNetworks().length, 2);

    apiClientManager.close();
});

test("adding a network with the config of a custom network throws", () => {
    console.log("\n=== ADD WITH CUSTOM NETWORK CONFIG ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    apiClientManager.addNetwork(CUSTOM_NETWORK, CUSTOM_NETWORK_CONFIG);

    assert.throws(
        () =>
            apiClientManager.addNetwork(
                SECOND_CUSTOM_NETWORK,
                CUSTOM_NETWORK_CONFIG,
            ),
        SAME_CONFIG_ERROR,
    );

    console.log("    Duplicate of the custom config rejected");

    assert.equal(apiClientManager.getNetworks().length, 3);

    apiClientManager.close();
});

test("adding a network with the same urls and another profile succeeds", () => {
    console.log("\n=== ADD WITH SAME URLS AND ANOTHER PROFILE ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const record: INetworkRecord = apiClientManager.addNetwork(
        CUSTOM_NETWORK,
        {
            ...NETWORKS_CONFIG[RUST_NETWORK],
            nodeApiProfile: NodeApiProfile.SCALA,
        },
    );

    console.log("    Added network id:", record.id);

    assert.equal(apiClientManager.getNetworks().length, 3);

    apiClientManager.close();
});

test("adding a network with the name of a default network throws", () => {
    console.log("\n=== ADD WITH DEFAULT NETWORK NAME ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    assert.throws(
        () => apiClientManager.addNetwork(RUST_NETWORK, CUSTOM_NETWORK_CONFIG),
        SAME_NAME_ERROR,
    );

    console.log("    Duplicate of the default name rejected");

    assert.equal(apiClientManager.getNetworks().length, 2);

    apiClientManager.close();
});

test("adding a network with the name of a custom network throws", () => {
    console.log("\n=== ADD WITH CUSTOM NETWORK NAME ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    apiClientManager.addNetwork(CUSTOM_NETWORK, CUSTOM_NETWORK_CONFIG);

    assert.throws(
        () =>
            apiClientManager.addNetwork(
                CUSTOM_NETWORK,
                SECOND_CUSTOM_NETWORK_CONFIG,
            ),
        SAME_NAME_ERROR,
    );

    console.log("    Duplicate of the custom name rejected");

    assert.equal(apiClientManager.getNetworks().length, 3);

    apiClientManager.close();
});

test("config duplicate is reported before name duplicate", () => {
    console.log("\n=== CONFIG CHECK RUNS FIRST ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    assert.throws(
        () =>
            apiClientManager.addNetwork(
                RUST_NETWORK,
                NETWORKS_CONFIG[RUST_NETWORK],
            ),
        SAME_CONFIG_ERROR,
    );

    console.log("    Full duplicate reported as a config duplicate");

    apiClientManager.close();
});

test("updating a network to the config of another network throws", () => {
    console.log("\n=== UPDATE TO ANOTHER NETWORK CONFIG ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const record: INetworkRecord = apiClientManager.addNetwork(
        CUSTOM_NETWORK,
        CUSTOM_NETWORK_CONFIG,
    );

    apiClientManager.addNetwork(
        SECOND_CUSTOM_NETWORK,
        SECOND_CUSTOM_NETWORK_CONFIG,
    );

    assert.throws(
        () =>
            apiClientManager.updateNetwork(record.id, {
                config: SECOND_CUSTOM_NETWORK_CONFIG,
            }),
        SAME_CONFIG_ERROR,
    );

    assert.throws(
        () =>
            apiClientManager.updateNetwork(record.id, {
                config: NETWORKS_CONFIG[RUST_NETWORK],
            }),
        SAME_CONFIG_ERROR,
    );

    console.log("    Config duplicates rejected on update");

    assert.deepEqual(
        apiClientManager.getNetwork(record.id).config,
        CUSTOM_NETWORK_CONFIG,
    );

    apiClientManager.close();
});

test("partial config update that produces a duplicate throws", () => {
    console.log("\n=== PARTIAL UPDATE TO A DUPLICATE CONFIG ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const record: INetworkRecord = apiClientManager.addNetwork(CUSTOM_NETWORK, {
        ...CUSTOM_NETWORK_CONFIG,
        nodeApiProfile: NodeApiProfile.SCALA,
    });

    apiClientManager.addNetwork(SECOND_CUSTOM_NETWORK, CUSTOM_NETWORK_CONFIG);

    assert.throws(
        () =>
            apiClientManager.updateNetwork(record.id, {
                config: { nodeApiProfile: NodeApiProfile.RUST },
            }),
        SAME_CONFIG_ERROR,
    );

    console.log("    Profile change into a duplicate rejected");

    assert.equal(
        apiClientManager.getNetwork(record.id).config.nodeApiProfile,
        NodeApiProfile.SCALA,
    );

    apiClientManager.close();
});

test("updating a network to the name of another network throws", () => {
    console.log("\n=== UPDATE TO ANOTHER NETWORK NAME ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const record: INetworkRecord = apiClientManager.addNetwork(
        CUSTOM_NETWORK,
        CUSTOM_NETWORK_CONFIG,
    );

    apiClientManager.addNetwork(
        SECOND_CUSTOM_NETWORK,
        SECOND_CUSTOM_NETWORK_CONFIG,
    );

    assert.throws(
        () =>
            apiClientManager.updateNetwork(record.id, {
                name: SECOND_CUSTOM_NETWORK,
            }),
        SAME_NAME_ERROR,
    );

    assert.throws(
        () => apiClientManager.updateNetwork(record.id, { name: RUST_NETWORK }),
        SAME_NAME_ERROR,
    );

    console.log("    Name duplicates rejected on update");

    assert.equal(apiClientManager.getNetwork(record.id).name, CUSTOM_NETWORK);

    apiClientManager.close();
});

test("updating a network with its own name and config succeeds", () => {
    console.log("\n=== UPDATE KEEPS OWN VALUES ===");

    const apiClientManager: ApiClientManager = initApiClientManager();

    const record: INetworkRecord = apiClientManager.addNetwork(
        CUSTOM_NETWORK,
        CUSTOM_NETWORK_CONFIG,
    );

    apiClientManager.updateNetwork(record.id, {
        name: CUSTOM_NETWORK,
        config: CUSTOM_NETWORK_CONFIG,
    });

    apiClientManager.updateNetwork(record.id, { name: SECOND_CUSTOM_NETWORK });

    const updated: INetworkRecord = apiClientManager.getNetwork(record.id);

    console.log("    Updated name:", updated.name);

    assert.equal(updated.name, SECOND_CUSTOM_NETWORK);
    assert.deepEqual(updated.config, CUSTOM_NETWORK_CONFIG);

    apiClientManager.close();
});
