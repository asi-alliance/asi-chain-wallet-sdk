import test from "node:test";
import assert from "node:assert/strict";

import Client from "@domains/Client";
import StorageManager from "@services/StorageManager";
import {
    INetworkConfig,
    INetworkRecord,
    INetworksState,
    IPersistedNetworkRecord,
    NetworkId,
} from "@domains/Network";
import {
    CUSTOM_NETWORK_CONFIG,
    NETWORKS_CONFIG,
    RUST_NETWORK,
    SCALA_NETWORK,
} from "./networks";

const CUSTOM_NETWORK: string = "Custom network";
const SHARED_NETWORK: string = "Shared network";

const OTHER_NETWORK_CONFIG: INetworkConfig = {
    ...CUSTOM_NETWORK_CONFIG,
    IndexerURL: "http://other-indexer.test:8080/v1/graphql",
};

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/network-state-event" };

const STORAGE_FAILURE: RegExp = /storage is unavailable/;
const SAME_NAME_FAILURE: RegExp = /Network with the same name already exists/;

interface INetworkStateContext {
    client: Client;
    events: INetworksState[];
}

const createContext = async (): Promise<INetworkStateContext> => {
    const events: INetworksState[] = [];

    const client: Client = await Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: SCALA_NETWORK,
        storageOptions: STORAGE_OPTIONS,
        eventDispatcher: {
            onNetworksChanged: (networksState: INetworksState) => {
                events.push(networksState);
            },
        },
    });

    return { client, events };
};

const failingWrite = async (): Promise<never> => {
    throw new Error("storage is unavailable");
};

const originalWrites = {
    save: StorageManager.saveCustomNetwork,
    update: StorageManager.updateCustomNetwork,
    remove: StorageManager.deleteCustomNetwork,
};

const whileWriteFails = async (
    breakWrite: () => void,
    action: () => Promise<unknown>,
): Promise<void> => {
    breakWrite();

    try {
        await assert.rejects(action, STORAGE_FAILURE);
    } finally {
        StorageManager.saveCustomNetwork = originalWrites.save;
        StorageManager.updateCustomNetwork = originalWrites.update;
        StorageManager.deleteCustomNetwork = originalWrites.remove;
    }
};

const names = (networksState: INetworksState): string[] =>
    networksState.networks.map((record: INetworkRecord) => record.name);

const countStoredByName = async (name: string): Promise<number> =>
    (await StorageManager.getCustomNetworks()).filter(
        (record: IPersistedNetworkRecord) => record.name === name,
    ).length;

console.log("\n[TEST NETWORKS]");
console.log("    Default networks:", SCALA_NETWORK, RUST_NETWORK);

test("a failed storage write changes neither the state nor the listeners", async () => {
    console.log("\n=== FAILED STORAGE WRITE ===");

    const { client, events }: INetworkStateContext = await createContext();

    const custom: INetworkRecord = await client.addNetwork(
        CUSTOM_NETWORK,
        CUSTOM_NETWORK_CONFIG,
    );

    assert.equal(events.length, 1);

    await whileWriteFails(
        () => {
            StorageManager.saveCustomNetwork = failingWrite;
        },
        () =>
            client.addNetwork("Unsaved network", {
                ...CUSTOM_NETWORK_CONFIG,
                IndexerURL: "http://unsaved-indexer.test:8080/v1/graphql",
            }),
    );

    console.log("    Networks after the failed add:", names(events[0]));

    assert.equal(client.getNetworks().length, 3);

    await whileWriteFails(
        () => {
            StorageManager.updateCustomNetwork = failingWrite;
        },
        () => client.updateNetwork(custom.id, { name: "Unsaved name" }),
    );

    console.log(
        "    Name after the failed update:",
        client.getNetwork(custom.id).name,
    );

    assert.equal(client.getNetwork(custom.id).name, CUSTOM_NETWORK);

    await whileWriteFails(
        () => {
            StorageManager.deleteCustomNetwork = failingWrite;
        },
        () => client.removeNetwork(custom.id),
    );

    console.log("    Network survived the failed remove:", custom.id);

    assert.equal(client.getNetwork(custom.id).id, custom.id);
    assert.equal(events.length, 1);

    await client.removeNetwork(custom.id);
    await client.close();
});

test("removing the selected network reports the new list and the new selection", async () => {
    console.log("\n=== REMOVE OF THE SELECTED NETWORK ===");

    const { client, events }: INetworkStateContext = await createContext();

    const custom: INetworkRecord = await client.addNetwork(
        CUSTOM_NETWORK,
        CUSTOM_NETWORK_CONFIG,
    );

    client.setNetwork(custom.id);

    assert.equal(client.getCurrentNetworkId(), custom.id);

    events.length = 0;

    await client.removeNetwork(custom.id);

    const [networksState]: INetworksState[] = events;

    console.log("    Networks in the event:", names(networksState));
    console.log(
        "    Selected in the event:",
        networksState.selectedNetwork.name,
    );

    assert.equal(events.length, 1);
    assert.equal(networksState.networks.length, 2);
    assert.equal(
        networksState.networks.some(
            (record: INetworkRecord) => record.id === custom.id,
        ),
        false,
    );

    const selectedId: NetworkId = networksState.selectedNetwork.id;

    assert.notEqual(selectedId, custom.id);
    assert.equal(client.getCurrentNetworkId(), selectedId);

    await client.close();
});

test("concurrent adds of the same network name store a single record", async () => {
    console.log("\n=== CONCURRENT ADD OF THE SAME NAME ===");

    const { client }: INetworkStateContext = await createContext();

    const [added, duplicate]: PromiseSettledResult<INetworkRecord>[] =
        await Promise.allSettled([
            client.addNetwork(SHARED_NETWORK, CUSTOM_NETWORK_CONFIG),
            client.addNetwork(SHARED_NETWORK, OTHER_NETWORK_CONFIG),
        ]);

    console.log("    Settled statuses:", added.status, duplicate.status);

    assert.ok(added.status === "fulfilled");
    assert.ok(duplicate.status === "rejected");
    assert.match(String(duplicate.reason), SAME_NAME_FAILURE);

    const storedCount: number = await countStoredByName(SHARED_NETWORK);

    console.log("    Stored records with the shared name:", storedCount);

    assert.equal(storedCount, 1);
    assert.equal(client.getNetworks().length, 3);

    await client.removeNetwork(added.value.id);
    await client.close();
});

test("concurrent renames of different networks to one name store a single record", async () => {
    console.log("\n=== CONCURRENT RENAME TO THE SAME NAME ===");

    const { client }: INetworkStateContext = await createContext();

    const first: INetworkRecord = await client.addNetwork(
        CUSTOM_NETWORK,
        CUSTOM_NETWORK_CONFIG,
    );
    const second: INetworkRecord = await client.addNetwork(
        "Second network",
        OTHER_NETWORK_CONFIG,
    );

    const [renamed, duplicate]: PromiseSettledResult<void>[] =
        await Promise.allSettled([
            client.updateNetwork(first.id, { name: SHARED_NETWORK }),
            client.updateNetwork(second.id, { name: SHARED_NETWORK }),
        ]);

    console.log("    Settled statuses:", renamed.status, duplicate.status);

    assert.equal(renamed.status, "fulfilled");
    assert.ok(duplicate.status === "rejected");
    assert.match(String(duplicate.reason), SAME_NAME_FAILURE);

    const storedCount: number = await countStoredByName(SHARED_NETWORK);

    console.log("    Stored records with the shared name:", storedCount);

    assert.equal(storedCount, 1);
    assert.equal(client.getNetwork(first.id).name, SHARED_NETWORK);
    assert.equal(client.getNetwork(second.id).name, "Second network");

    await client.removeNetwork(first.id);
    await client.removeNetwork(second.id);
    await client.close();
});
