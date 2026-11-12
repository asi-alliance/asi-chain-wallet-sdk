import test from "node:test";
import assert from "node:assert/strict";

import Account from "@domains/Account";
import ApiClientManager from "@domains/ApiClientManager";
import Client from "@domains/Client";
import { INetworkRecord, IPersistedNetworkRecord } from "@domains/Network";
import { IReservedOperationResult } from "@domains/ReservationAdapter";
import { ITransactionReservation, Transaction } from "@domains/Transaction";
import Wallet from "@domains/Wallet";
import AccountDataService from "@services/AccountDataService";
import { SignedResult } from "@services/Signer";
import StorageManager from "@services/StorageManager";
import { IPrecisionNode, startPrecisionNode } from "./precisionNode";

interface IFundedWallet {
    wallet: Wallet;
    account: Account;
    request: { walletId: string; accountId: string };
}

const PASSWORD: string = "test-wallet-password";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/native-precision-flow" };

const NATIVE_18_NETWORK: string = "Wide";
const NATIVE_8_NETWORK: string = "Legacy";

const NATIVE_18_BALANCE: bigint = 100000000000000000000n;
const NATIVE_8_BALANCE: bigint = 150000000n;

const INVALID_NATIVE_TOKEN_DECIMALS_ERROR: RegExp =
    /Native token decimals must be an integer from 0 to 18/;

let native18Node: IPrecisionNode;
let native8Node: IPrecisionNode;
let client: Client;

const createClient = (): Promise<Client> =>
    Client.create({
        networksConfig: {
            [NATIVE_18_NETWORK]: native18Node.config,
            [NATIVE_8_NETWORK]: native8Node.config,
        },
        defaultNetwork: NATIVE_18_NETWORK,
        storageOptions: STORAGE_OPTIONS,
    });

const createFundedWallet = async (): Promise<IFundedWallet> => {
    const wallet: Wallet = await client.createPrivateKeyWallet(
        {
            privateKey: client.generatePrivateKey(),
            accountName: "Fixture wallet",
        },
        PASSWORD,
    );

    await client.unlockWallet(wallet.getId(), PASSWORD);

    const account: Account = wallet.getAccounts()[0];

    return {
        wallet,
        account,
        request: { walletId: wallet.getId(), accountId: account.getId() },
    };
};

const addCustomNetwork = (): Promise<INetworkRecord> =>
    client.addNetwork("Custom", {
        ...native18Node.config,
        IndexerURL: `${native18Node.config.IndexerURL}?custom`,
    });

const getNetworkDecimals = (networkId: string): number =>
    ApiClientManager.getInstance().getNetwork(networkId).config
        .nativeTokenDecimals;

const getStoredNetworkDecimals = async (
    networkId: string,
): Promise<number | undefined> => {
    const records: IPersistedNetworkRecord[] =
        await StorageManager.getCustomNetworks();

    return records.find(
        (record: IPersistedNetworkRecord) => record.id === networkId,
    )?.config.nativeTokenDecimals;
};

test.before(async () => {
    native18Node = await startPrecisionNode(18);
    native8Node = await startPrecisionNode(8);
});

test.beforeEach(async () => {
    client = await createClient();

    await client.clearPersistence();
    await client.close();

    client = await createClient();

    native18Node.setBalance(NATIVE_18_BALANCE);
    native8Node.setBalance(NATIVE_8_BALANCE);
});

test.afterEach(async () => {
    await client.close();
});

test.after(async () => {
    await native18Node.close();
    await native8Node.close();
});

test("selected precision reaches facade, balances and fees", async () => {
    console.log("\n=== SELECTED PRECISION REACHES THE FACADE ===");

    const { account }: IFundedWallet = await createFundedWallet();

    const native18Balance: bigint = await client.getBalance(
        account.getAddress(),
    );

    console.log(
        "    18-decimal balance:",
        client.toDisplayAmount(native18Balance),
    );

    assert.equal(client.getCurrentNetwork().config.nativeTokenDecimals, 18);
    assert.equal(
        client.toAtomicAmount("10.000000000000000001"),
        10000000000000000001n,
    );
    assert.equal(client.toDisplayAmount(native18Balance), "100");
    assert.equal(client.toDisplayAmount(250000n), "0.00000000000025");

    client.setNetwork(NATIVE_8_NETWORK);

    const native8Balance: bigint = await client.getBalance(
        account.getAddress(),
    );

    console.log(
        "    8-decimal balance:",
        client.toDisplayAmount(native8Balance),
    );

    assert.equal(client.getCurrentNetwork().config.nativeTokenDecimals, 8);
    assert.equal(client.toAtomicAmount("1.5"), 150000000n);
    assert.equal(client.toDisplayAmount(native8Balance), "1.5");
    assert.equal(client.toDisplayAmount(250000n), "0.0025");
    assert.equal(
        native18Node.requests.some((url: string) => url.includes("status")),
        false,
    );
});

test("wide transfer term, available balance and pending history retain every atomic unit", async () => {
    console.log("\n=== WIDE TRANSFER KEEPS EVERY ATOMIC UNIT ===");

    const { wallet, account, request }: IFundedWallet =
        await createFundedWallet();

    const amount: bigint = client.toAtomicAmount("10.000000000000000001");

    const sent: IReservedOperationResult = await client.transfer({
        ...request,
        to: account.getAddress(),
        amount,
    });

    const submittedDeploys: SignedResult[] =
        native18Node.getSubmittedDeploys();
    const submittedTerm: string =
        submittedDeploys[submittedDeploys.length - 1].data.term;

    assert.ok(submittedTerm.includes("10000000000000000001n"));

    const availableBalance: bigint = await client.getAvailableBalance(
        request.walletId,
        request.accountId,
    );

    console.log(
        "    Available balance:",
        client.toDisplayAmount(availableBalance),
    );

    assert.equal(
        client.toDisplayAmount(availableBalance),
        "89.999999999999499999",
    );

    const [reservation]: ITransactionReservation[] =
        await client.getReservations(wallet.getId());

    assert.equal(reservation.nativeTokenDecimals, 18);
    assert.equal(reservation.details.amount, "10.000000000000000001");
    assert.equal(reservation.details.gasCost, "0.0000000000005");
    assert.equal(
        reservation.details.gasCost,
        client.toDisplayAmount(client.getTransferGasReserve()),
    );

    const signerId: string = wallet.getSigner().getId();

    await client.close();

    client = await createClient();

    const restoredWallet: Wallet = await client.openWallet(signerId, PASSWORD);

    const history: Transaction[] = await client.getTransactionsHistory(
        restoredWallet.getId(),
        account.getId(),
        { sources: ["pending"] },
    );

    const pendingTransfer: Transaction | undefined = history.find(
        (transaction: Transaction) => transaction.deployId === sent.deployId,
    );

    console.log("    Restored pending amount:", pendingTransfer?.amount);

    assert.equal(pendingTransfer?.amount, "10.000000000000000001");
    assert.equal(pendingTransfer?.nativeTokenDecimals, 18);

    client.setNetwork(NATIVE_8_NETWORK);

    assert.equal(
        (await client.getReservations(restoredWallet.getId())).length,
        0,
    );
    assert.equal(
        await client.getAvailableBalance(
            restoredWallet.getId(),
            account.getId(),
        ),
        NATIVE_8_BALANCE,
    );
});

test("deploy reservations format fee products using the captured precision", async () => {
    console.log("\n=== DEPLOY FEE USES THE CAPTURED PRECISION ===");

    const { request }: IFundedWallet = await createFundedWallet();

    await client.deploy({ ...request, term: "Nil", phloLimit: 1000000 });

    const [reservation]: ITransactionReservation[] =
        await client.getReservations(request.walletId);

    console.log("    Deploy fee:", reservation.details.gasCost);

    assert.equal(reservation.pendingAmount, "1000000");
    assert.equal(reservation.details.gasCost, "0.000000000001");
    assert.equal(reservation.nativeTokenDecimals, 18);
});

test("custom precision is persisted, can be corrected and survives a client restart", async () => {
    console.log("\n=== CUSTOM PRECISION IS PERSISTED ===");

    const custom: INetworkRecord = await addCustomNetwork();

    client.setNetwork(custom.id);

    const { wallet, account, request }: IFundedWallet =
        await createFundedWallet();

    await client.addTransactionReservation({
        ...request,
        kind: "transfer",
        deployId: "external",
        to: account.getAddress(),
        amount: 1n,
        gasCost: 250000n,
        pendingAmount: 250001n,
    });

    const [stored]: ITransactionReservation[] = await client.getReservations(
        wallet.getId(),
    );

    assert.equal(stored.details.amount, "0.000000000000000001");

    client.closeWallet(wallet.getId());

    await client.updateNetwork(custom.id, {
        config: { nativeTokenDecimals: 8 },
    });

    console.log("    Corrected decimals:", getNetworkDecimals(custom.id));

    assert.equal(getNetworkDecimals(custom.id), 8);
    assert.equal(await getStoredNetworkDecimals(custom.id), 8);

    await client.close();

    client = await createClient();
    client.setNetwork(custom.id);

    assert.equal(client.getCurrentNetwork().config.nativeTokenDecimals, 8);
});

test("invalid updates fail before configuration is written", async () => {
    console.log("\n=== INVALID PRECISION UPDATES ARE REJECTED ===");

    const custom: INetworkRecord = await addCustomNetwork();

    for (const nativeTokenDecimals of [19, -1, 1.5]) {
        await assert.rejects(
            client.updateNetwork(custom.id, {
                config: { nativeTokenDecimals },
            }),
            INVALID_NATIVE_TOKEN_DECIMALS_ERROR,
        );

        assert.equal(getNetworkDecimals(custom.id), 18);
    }

    await client.updateNetwork(custom.id, {
        config: { nativeTokenDecimals: undefined },
    });

    console.log(
        "    Decimals after an empty update:",
        getNetworkDecimals(custom.id),
    );

    assert.equal(getNetworkDecimals(custom.id), 18);
});

test("history queries bind endpoints and precision-independent recorded amounts to the requested network", async () => {
    console.log("\n=== HISTORY IS READ FROM THE REQUESTED NETWORK ===");

    const accountDataService: AccountDataService = new AccountDataService();

    const native8History: Transaction[] =
        await accountDataService.getTransactionHistory(
            "recipient",
            "key",
            {},
            NATIVE_8_NETWORK,
        );

    console.log("    8-decimal history amount:", native8History[0].amount);

    assert.equal(client.getCurrentNetworkId(), NATIVE_18_NETWORK);
    assert.equal(native8History[0].networkId, NATIVE_8_NETWORK);
    assert.equal(native8History[0].amount, "1.50000000");

    const native18History: Transaction[] =
        await accountDataService.getTransactionHistory(
            "recipient",
            "key",
            {},
            NATIVE_18_NETWORK,
        );

    console.log("    18-decimal history amount:", native18History[0].amount);

    assert.equal(native18History[0].amount, "10.000000000000000001");
});
