import test from "node:test";
import assert from "node:assert/strict";

import Client from "@domains/Client";
import Wallet from "@domains/Wallet";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { NetworkName, TNetworksConfig } from "@domains/Network";
import KeysManager from "@services/KeysManager";

const PASSWORD = "12345678";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/client-session-policy" };

const NETWORK_NAME: NetworkName = "local";

const NETWORKS_CONFIG: TNetworksConfig = {
    [NETWORK_NAME]: {
        ValidatorURL: "http://localhost:40403",
        ReadOnlyURL: "http://localhost:40403",
        IndexerURL: "http://localhost:9090",
        nodeApiProfile: NodeApiProfile.RUST,
    },
};

const createClient = (autoLockMs: number): Promise<Client> =>
    Client.create({
        networksConfig: NETWORKS_CONFIG,
        defaultNetwork: NETWORK_NAME,
        storageOptions: STORAGE_OPTIONS,
        security: { autoLockMs },
    });

const createWallet = (client: Client): Promise<Wallet> =>
    client.createPrivateKeyWallet(
        {
            privateKey: KeysManager.generateRandomKey(),
            accountName: "Main",
        },
        PASSWORD,
    );

test("a zero autoLockMs makes the client require a password for every signature", async () => {
    const client: Client = await createClient(0);
    const wallet: Wallet = await createWallet(client);

    await assert.rejects(
        () => client.unlockWallet(wallet.getId(), PASSWORD),
        /Session policy requires a password for every signature/,
    );

    assert.equal(wallet.isUnlocked(), false);

    await client.clearPersistence();
    await client.close();
});

test("a negative autoLockMs opens a wallet without holding a signing session", async () => {
    const client: Client = await createClient(-1);
    const signerId: string = (await createWallet(client)).getSigner().getId();

    client.closeAllWallets();

    const openedWallet: Wallet = await client.openWallet(signerId, PASSWORD);

    assert.equal(openedWallet.isUnlocked(), false);

    await assert.rejects(
        () => client.unlockWallet(openedWallet.getId(), PASSWORD),
        /Session policy requires a password for every signature/,
    );

    await client.clearPersistence();
    await client.close();
});
