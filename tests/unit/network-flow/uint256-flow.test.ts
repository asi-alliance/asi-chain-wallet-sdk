import assert from "node:assert/strict";
import test from "node:test";
import Client from "@domains/Client";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { BalanceUnavailableError } from "@domains/CustomError";
import { MAX_TOKEN_AMOUNT } from "@utils/monetary";
import { startPrecisionNode } from "./precisionNode";

const PASSWORD = "uint256-fixture-password";
let node: Awaited<ReturnType<typeof startPrecisionNode>>;
let client: Client;
const create = () => Client.create({
    networksConfig: { Wide: node.config },
    defaultNetwork: "Wide",
    storageOptions: { nodeStorageDir: ".tmp/uint256-flow" },
});
const funded = async () => {
    const wallet = await client.createPrivateKeyWallet({
        privateKey: client.generatePrivateKey(), accountName: "UInt256 fixture",
    }, PASSWORD);
    await client.unlockWallet(wallet.getId(), PASSWORD);
    const account = wallet.getAccounts()[0];
    return { wallet, account, request: { walletId: wallet.getId(), accountId: account.getId() } };
};

test.before(async () => { node = await startPrecisionNode(18, NodeApiProfile.RUST_UINT256); });
test.beforeEach(async () => {
    client = await create(); await client.clearPersistence(); await client.close(); client = await create();
    node.setBalance(100000000000000000000n);
});
test.afterEach(async () => { await client.close(); });
test.after(async () => { await node.close(); });

test("wide transfer price survives signing, HTTP, reservations, reopening and pending history", async () => {
    const { wallet, account, request } = await funded();
    const amount = 10000000000000000001n;
    const price = 9007199254740993n;
    const sent = await client.transfer({ ...request, to: account.getAddress(), amount, phloLimit: 3, phloPrice: price });
    const submitted = node.submitted.at(-1)!;
    assert.equal(submitted.data.phloPrice, price.toString());
    assert.equal(submitted.data.phloLimit, 3);
    assert.equal("nodeApiProfile" in submitted, false);
    assert.ok(submitted.data.term.includes("10000000000000000001n"));
    assert.equal(await client.getAvailableBalance(request.walletId, request.accountId), 100000000000000000000n - amount - 3n * price);
    const reservation = (await client.getReservations(wallet.getId()))[0];
    assert.equal(reservation.pendingAmount, (amount + 3n * price).toString());
    assert.equal(reservation.details.gasCost, client.toDisplayAmount(3n * price));
    const signerId = wallet.getSigner().getId();
    await client.close(); client = await create();
    const restored = await client.openWallet(signerId, PASSWORD);
    const history = await client.getTransactionsHistory(restored.getId(), account.getId(), { sources: ["pending"] });
    const transaction = history.find(tx => tx.deployId === sent.deployId)!;
    assert.equal(transaction.amount, "10.000000000000000001");
    assert.equal(transaction.gasCost, client.toDisplayAmount(3n * price));
    assert.equal(transaction.nativeTokenDecimals, 18);
});

test("deploy reserves exact wide fees and overflow never reaches HTTP or storage", async () => {
    const { request } = await funded();
    const price = "9007199254740993";
    await client.deploy({ ...request, term: "Nil", phloLimit: 2, phloPrice: price });
    assert.equal(node.submitted.at(-1)!.data.phloPrice, price);
    assert.equal((await client.getReservations(request.walletId))[0].pendingAmount, (2n * BigInt(price)).toString());
    const count = node.submitted.length;
    await assert.rejects(client.deploy({ ...request, term: "Nil", phloLimit: 2, phloPrice: MAX_TOKEN_AMOUNT }), /charge exceeds/);
    assert.equal(node.submitted.length, count);
    assert.equal((await client.getReservations(request.walletId)).length, 1);
});

test("uint256 balances require canonical bounded strings and never become zero on error", async () => {
    const { account } = await funded();
    for (const raw of ["01", "-1", "1.0", "1e2", 1, null, (MAX_TOKEN_AMOUNT + 1n).toString()]) {
        node.setBalanceResponse(raw);
        await assert.rejects(client.getBalance(account.getAddress()), BalanceUnavailableError);
    }
    node.setBalance(MAX_TOKEN_AMOUNT);
    assert.equal(await client.getBalance(account.getAddress()), MAX_TOKEN_AMOUNT);
    node.setBalance(0n);
    assert.equal(await client.getBalance(account.getAddress()), 0n);
});
