import assert from "node:assert/strict";
import test from "node:test";
import Client from "@domains/Client";
import ApiClientManager from "@domains/ApiClientManager";
import StorageManager from "@services/StorageManager";
import AccountDataService from "@services/AccountDataService";
import { startPrecisionNode } from "./precisionNode";

const PASSWORD = "test-wallet-password";
const OPTIONS = { nodeStorageDir: ".tmp/native-precision-flow" };
let wide: Awaited<ReturnType<typeof startPrecisionNode>>;
let legacy: Awaited<ReturnType<typeof startPrecisionNode>>;
let client: Client;
const create = () => Client.create({
    networksConfig: { Wide: wide.config, Legacy: legacy.config },
    defaultNetwork: "Wide", storageOptions: OPTIONS,
});
const funded = async () => {
    const wallet = await client.createPrivateKeyWallet({
        privateKey: client.generatePrivateKey(), accountName: "Fixture wallet",
    }, PASSWORD);
    await client.unlockWallet(wallet.getId(), PASSWORD);
    const account = wallet.getAccounts()[0];
    return { wallet, account, request: { walletId: wallet.getId(), accountId: account.getId() } };
};
test.before(async () => { wide = await startPrecisionNode(18); legacy = await startPrecisionNode(8); });
test.beforeEach(async () => {
    client = await create(); await client.clearPersistence(); await client.close(); client = await create();
    wide.setBalance(100000000000000000000n); legacy.setBalance(150000000n);
});
test.afterEach(async () => { await client.close(); });
test.after(async () => { await wide.close(); await legacy.close(); });

test("selected precision reaches facade, balances and fees", async () => {
    const { account } = await funded();
    assert.equal(client.getCurrentNetwork().config.nativeTokenDecimals, 18);
    assert.equal(client.toAtomicAmount("10.000000000000000001"), 10000000000000000001n);
    assert.equal(client.toDisplayAmount(await client.getBalance(account.getAddress())), "100");
    assert.equal(client.toDisplayAmount(250000n), "0.00000000000025");
    client.setNetwork("Legacy");
    assert.equal(client.getCurrentNetwork().config.nativeTokenDecimals, 8);
    assert.equal(client.toAtomicAmount("1.5"), 150000000n);
    assert.equal(client.toDisplayAmount(await client.getBalance(account.getAddress())), "1.5");
    assert.equal(client.toDisplayAmount(250000n), "0.0025");
    assert.equal(wide.requests.some((url) => url.includes("status")), false);
});

test("wide transfer term, available balance and pending history retain every atomic unit", async () => {
    const { wallet, account, request } = await funded();
    const amount = client.toAtomicAmount("10.000000000000000001");
    const sent = await client.transfer({ ...request, to: account.getAddress(), amount });
    assert.ok(wide.submitted[wide.submitted.length - 1].data.term.includes("10000000000000000001n"));
    assert.equal(client.toDisplayAmount(await client.getAvailableBalance(request.walletId, request.accountId)), "89.999999999999749999");
    const reservation = (await client.getReservations(wallet.getId()))[0];
    assert.equal(reservation.nativeTokenDecimals, 18);
    assert.equal(reservation.details.amount, "10.000000000000000001");
    assert.equal(reservation.details.gasCost, "0.00000000000025");
    const signerId = wallet.getSigner().getId();
    await client.close(); client = await create();
    const restored = await client.openWallet(signerId, PASSWORD);
    const history = await client.getTransactionsHistory(restored.getId(), account.getId(), { sources: ["pending"] });
    assert.equal(history.find((tx) => tx.deployId === sent.deployId)?.amount, "10.000000000000000001");
    assert.equal(history.find((tx) => tx.deployId === sent.deployId)?.nativeTokenDecimals, 18);
    client.setNetwork("Legacy");
    assert.equal((await client.getReservations(restored.getId())).length, 0);
    assert.equal(await client.getAvailableBalance(restored.getId(), account.getId()), 150000000n);
});

test("deploy reservations format fee products using the captured precision", async () => {
    const { request } = await funded();
    await client.deploy({ ...request, term: "Nil", phloLimit: 1000000 });
    const reservation = (await client.getReservations(request.walletId))[0];
    assert.equal(reservation.pendingAmount, "1000000");
    assert.equal(reservation.details.gasCost, "0.000000000001");
    assert.equal(reservation.nativeTokenDecimals, 18);
});

test("custom precision is persisted, can be corrected and survives a client restart", async () => {
    const custom = await client.addNetwork("Custom", { ...wide.config, IndexerURL: `${wide.config.IndexerURL}?custom` });
    client.setNetwork(custom.id);
    const { wallet, account, request } = await funded();
    await client.addTransactionReservation({
        ...request, kind: "transfer", deployId: "external", to: account.getAddress(),
        amount: 1n, gasCost: 250000n, pendingAmount: 250001n,
    });
    const stored = (await client.getReservations(wallet.getId()))[0];
    assert.equal(stored.details.amount, "0.000000000000000001");
    client.closeWallet(wallet.getId());
    await client.updateNetwork(custom.id, { config: { nativeTokenDecimals: 8 } });
    assert.equal(ApiClientManager.getInstance().getNetwork(custom.id).config.nativeTokenDecimals, 8);
    assert.equal((await StorageManager.getCustomNetworks()).find((record) => record.id === custom.id)?.config.nativeTokenDecimals, 8);
    await client.close(); client = await create(); client.setNetwork(custom.id);
    assert.equal(client.getCurrentNetwork().config.nativeTokenDecimals, 8);
});

test("invalid updates fail before configuration is written", async () => {
    const custom = await client.addNetwork("Custom", { ...wide.config, IndexerURL: `${wide.config.IndexerURL}?custom` });
    for (const nativeTokenDecimals of [19, -1, 1.5]) {
        await assert.rejects(
            client.updateNetwork(custom.id, { config: { nativeTokenDecimals } }),
            /Native token decimals must be an integer from 0 to 18/,
        );
        assert.equal(ApiClientManager.getInstance().getNetwork(custom.id).config.nativeTokenDecimals, 18);
    }

    await client.updateNetwork(custom.id, {
        config: { nativeTokenDecimals: undefined },
    });
    assert.equal(ApiClientManager.getInstance().getNetwork(custom.id).config.nativeTokenDecimals, 18);
});

test("history queries bind endpoints and precision-independent recorded amounts to the requested network", async () => {
    const history = await new AccountDataService().getTransactionHistory("recipient", "key", {}, "Legacy");
    assert.equal(client.getCurrentNetworkId(), "Wide");
    assert.equal(history[0].networkId, "Legacy");
    assert.equal(history[0].amount, "1.50000000");
    const wideHistory = await new AccountDataService().getTransactionHistory("recipient", "key", {}, "Wide");
    assert.equal(wideHistory[0].amount, "10.000000000000000001");
});
