import test from "node:test";
import assert from "node:assert/strict";

import {
    DEFAULT_PHLO_LIMIT,
    DEFAULT_PHLO_PRICE,
    GasFee,
    MAX_NATIVE_TOKEN_DECIMALS,
    NATIVE_TOKEN_DECIMALS_AMOUNT,
} from "@config/index";
import Account from "@domains/Account";
import ApiClientManager from "@domains/ApiClientManager";
import Client, { TTransactionReservationRequest } from "@domains/Client";
import { INetworkRecord, IPersistedNetworkRecord } from "@domains/Network";
import NodeApiAdapter from "@domains/NodeApiAdapter";
import NodeApiProvider from "@domains/NodeApiProvider";
import ReservationAdapter, {
    IReservedOperationResult,
} from "@domains/ReservationAdapter";
import {
    ITransactionReservation,
    ITransactionReservationInput,
    Transaction,
} from "@domains/Transaction";
import Wallet from "@domains/Wallet";
import { TCreateTransactionReservationPayload } from "@fabrics/transactionReservation";
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

const NATIVE_18_DECIMALS: number = MAX_NATIVE_TOKEN_DECIMALS;
const NATIVE_8_DECIMALS: number = NATIVE_TOKEN_DECIMALS_AMOUNT;

const NATIVE_18_BALANCE: bigint = 100000000000000000000n;
const NATIVE_8_BALANCE: bigint = 150000000n;

const NATIVE_18_DISPLAY_BALANCE: string = "100";
const NATIVE_8_DISPLAY_BALANCE: string = "1.5";

const WIDE_AMOUNT: string = "10.000000000000000001";
const WIDE_ATOMIC_AMOUNT: bigint = 10000000000000000001n;
const WIDE_AMOUNT_LITERAL: string = "10000000000000000001n";
const WIDE_AVAILABLE_BALANCE: string = "89.999999999999499999";
const WIDE_TRANSFER_GAS_COST: string = "0.0000000000005";

const NATIVE_8_AMOUNT: string = "1.5";
const NATIVE_8_ATOMIC_AMOUNT: bigint = 150000000n;

const GAS_COST: bigint = GasFee.MAX;
const NATIVE_18_GAS_COST: string = "0.00000000000025";
const NATIVE_8_GAS_COST: string = "0.0025";

const EXTERNAL_DEPLOY_ID: string = "external";
const EXTERNAL_AMOUNT: bigint = 1n;
const EXTERNAL_PENDING_AMOUNT: bigint = EXTERNAL_AMOUNT + GAS_COST;
const EXTERNAL_NATIVE_18_AMOUNT: string = "0.000000000000000001";
const EXTERNAL_NATIVE_8_AMOUNT: string = "0.00000001";

const DEPLOY_TERM: string = "Nil";
const DEPLOY_PHLO_LIMIT: number = 1000000;
const DEPLOY_GAS_COST: string = "0.000000000001";

const RESERVATION_LIFETIME_MS: number = 5 * 60 * 1000;

const NODE_STATUS_PATH: string = "status";

const HISTORY_ADDRESS: string = "recipient";
const HISTORY_PUBLIC_KEY: string = "key";
const NATIVE_8_HISTORY_AMOUNT: string = "1.50000000";

const INVALID_NATIVE_TOKEN_DECIMALS: number[] = [
    MAX_NATIVE_TOKEN_DECIMALS + 1,
    -1,
    1.5,
];

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

const createExternalReservationRequest = ({
    request,
    account,
}: IFundedWallet): TTransactionReservationRequest => ({
    ...request,
    kind: "transfer",
    deployId: EXTERNAL_DEPLOY_ID,
    to: account.getAddress(),
    amount: EXTERNAL_AMOUNT,
    gasCost: GAS_COST,
    pendingAmount: EXTERNAL_PENDING_AMOUNT,
});

test.before(async () => {
    native18Node = await startPrecisionNode(NATIVE_18_DECIMALS);
    native8Node = await startPrecisionNode(NATIVE_8_DECIMALS);
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

    assert.equal(
        client.getCurrentNetwork().config.nativeTokenDecimals,
        NATIVE_18_DECIMALS,
    );
    assert.equal(client.toAtomicAmount(WIDE_AMOUNT), WIDE_ATOMIC_AMOUNT);
    assert.equal(client.toExactAtomicAmount(WIDE_AMOUNT), WIDE_ATOMIC_AMOUNT);
    assert.equal(
        client.toDisplayAmount(native18Balance),
        NATIVE_18_DISPLAY_BALANCE,
    );
    assert.equal(client.toDisplayAmount(GAS_COST), NATIVE_18_GAS_COST);

    client.setNetwork(NATIVE_8_NETWORK);

    const native8Balance: bigint = await client.getBalance(
        account.getAddress(),
    );

    console.log(
        "    8-decimal balance:",
        client.toDisplayAmount(native8Balance),
    );

    assert.equal(
        client.getCurrentNetwork().config.nativeTokenDecimals,
        NATIVE_8_DECIMALS,
    );
    assert.equal(client.toAtomicAmount(NATIVE_8_AMOUNT), NATIVE_8_ATOMIC_AMOUNT);
    assert.equal(
        client.toExactAtomicAmount(NATIVE_8_AMOUNT),
        NATIVE_8_ATOMIC_AMOUNT,
    );
    assert.equal(
        client.toDisplayAmount(native8Balance),
        NATIVE_8_DISPLAY_BALANCE,
    );
    assert.equal(client.toDisplayAmount(GAS_COST), NATIVE_8_GAS_COST);

    const isStatusRequested: boolean = native18Node.requests.some(
        (url: string) => url.includes(NODE_STATUS_PATH),
    );

    console.log("    Precision read from the node status:", isStatusRequested);

    assert.equal(isStatusRequested, false);
});

test("wide transfer term, available balance and pending history retain every atomic unit", async () => {
    console.log("\n=== WIDE TRANSFER KEEPS EVERY ATOMIC UNIT ===");

    const { wallet, account, request }: IFundedWallet =
        await createFundedWallet();

    const amount: bigint = client.toExactAtomicAmount(WIDE_AMOUNT);

    const sent: IReservedOperationResult = await client.transfer({
        ...request,
        to: account.getAddress(),
        amount,
    });

    const submittedDeploys: SignedResult[] =
        native18Node.getSubmittedDeploys();
    const submitted: SignedResult =
        submittedDeploys[submittedDeploys.length - 1];

    console.log("    Submitted phlo price:", submitted.data.phloPrice);

    assert.ok(submitted.data.term.includes(WIDE_AMOUNT_LITERAL));
    assert.equal(submitted.data.phloPrice, String(DEFAULT_PHLO_PRICE));
    assert.equal(submitted.data.phloLimit, DEFAULT_PHLO_LIMIT);
    assert.equal("nodeApiProfile" in submitted, false);

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
        WIDE_AVAILABLE_BALANCE,
    );

    const [reservation]: ITransactionReservation[] =
        await client.getReservations(wallet.getId());

    assert.equal(reservation.nativeTokenDecimals, NATIVE_18_DECIMALS);
    assert.equal(reservation.details.amount, WIDE_AMOUNT);
    assert.equal(reservation.details.gasCost, WIDE_TRANSFER_GAS_COST);
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
    console.log("    Restored pending fee:", pendingTransfer?.gasCost);

    assert.equal(pendingTransfer?.amount, WIDE_AMOUNT);
    assert.equal(pendingTransfer?.gasCost, WIDE_TRANSFER_GAS_COST);
    assert.equal(pendingTransfer?.nativeTokenDecimals, NATIVE_18_DECIMALS);

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

    await client.deploy({
        ...request,
        term: DEPLOY_TERM,
        phloLimit: DEPLOY_PHLO_LIMIT,
    });

    const [reservation]: ITransactionReservation[] =
        await client.getReservations(request.walletId);

    console.log("    Deploy fee:", reservation.details.gasCost);

    assert.equal(reservation.pendingAmount, String(DEPLOY_PHLO_LIMIT));
    assert.equal(reservation.details.gasCost, DEPLOY_GAS_COST);
    assert.equal(reservation.nativeTokenDecimals, NATIVE_18_DECIMALS);
});

test("custom precision is persisted, can be corrected and survives a client restart", async () => {
    console.log("\n=== CUSTOM PRECISION IS PERSISTED ===");

    const custom: INetworkRecord = await addCustomNetwork();

    client.setNetwork(custom.id);

    const fundedWallet: IFundedWallet = await createFundedWallet();

    await client.addTransactionReservation(
        createExternalReservationRequest(fundedWallet),
    );

    const [stored]: ITransactionReservation[] = await client.getReservations(
        fundedWallet.wallet.getId(),
    );

    assert.equal(stored.details.amount, EXTERNAL_NATIVE_18_AMOUNT);

    client.closeWallet(fundedWallet.wallet.getId());

    await client.updateNetwork(custom.id, {
        config: { nativeTokenDecimals: NATIVE_8_DECIMALS },
    });

    console.log("    Corrected decimals:", getNetworkDecimals(custom.id));

    assert.equal(getNetworkDecimals(custom.id), NATIVE_8_DECIMALS);
    assert.equal(await getStoredNetworkDecimals(custom.id), NATIVE_8_DECIMALS);

    await client.close();

    client = await createClient();
    client.setNetwork(custom.id);

    assert.equal(
        client.getCurrentNetwork().config.nativeTokenDecimals,
        NATIVE_8_DECIMALS,
    );
});

test("precision change keeps open reservations and their update takes the network precision", async () => {
    console.log("\n=== PRECISION CHANGE KEEPS OPEN RESERVATIONS ===");

    const custom: INetworkRecord = await addCustomNetwork();

    client.setNetwork(custom.id);

    const fundedWallet: IFundedWallet = await createFundedWallet();

    const reservationRequest: TTransactionReservationRequest =
        createExternalReservationRequest(fundedWallet);

    await client.addTransactionReservation(reservationRequest);

    await client.updateNetwork(custom.id, {
        config: { nativeTokenDecimals: NATIVE_8_DECIMALS },
    });

    const [kept]: ITransactionReservation[] = await client.getReservations(
        fundedWallet.wallet.getId(),
    );

    console.log("    Kept reservation precision:", kept.nativeTokenDecimals);

    assert.equal(kept.nativeTokenDecimals, NATIVE_18_DECIMALS);
    assert.equal(kept.pendingAmount, String(EXTERNAL_PENDING_AMOUNT));
    assert.equal(kept.details.amount, EXTERNAL_NATIVE_18_AMOUNT);

    const updated: ITransactionReservation =
        await client.updateTransactionReservation(kept.id, reservationRequest);

    console.log(
        "    Updated reservation precision:",
        updated.nativeTokenDecimals,
    );

    assert.equal(updated.nativeTokenDecimals, NATIVE_8_DECIMALS);
    assert.equal(updated.pendingAmount, String(EXTERNAL_PENDING_AMOUNT));
    assert.equal(updated.details.amount, EXTERNAL_NATIVE_8_AMOUNT);
});

test("a reservation payload without precision takes the precision of its network", async () => {
    console.log("\n=== RESERVATION WITHOUT PRECISION USES THE NETWORK ===");

    const { wallet, account }: IFundedWallet = await createFundedWallet();
    const reservationAdapter: ReservationAdapter = new ReservationAdapter([]);

    const payload: TCreateTransactionReservationPayload = {
        kind: "transfer",
        deployId: EXTERNAL_DEPLOY_ID,
        networkId: client.getCurrentNetwork().id,
        account,
        pendingAmount: EXTERNAL_PENDING_AMOUNT,
        gasCost: GAS_COST,
        details: { to: account.getAddress(), amount: EXTERNAL_AMOUNT },
    };

    try {
        const added: ITransactionReservation = await reservationAdapter.add(
            wallet,
            payload,
        );

        console.log(
            "    Added reservation precision:",
            added.nativeTokenDecimals,
        );

        assert.equal(added.nativeTokenDecimals, NATIVE_18_DECIMALS);
        assert.equal(added.details.amount, EXTERNAL_NATIVE_18_AMOUNT);
        assert.equal(added.details.gasCost, NATIVE_18_GAS_COST);

        const updated: ITransactionReservation =
            await reservationAdapter.update(wallet, added.id, payload);

        console.log(
            "    Updated reservation precision:",
            updated.nativeTokenDecimals,
        );

        assert.equal(updated.nativeTokenDecimals, NATIVE_18_DECIMALS);
        assert.equal(updated.details.amount, EXTERNAL_NATIVE_18_AMOUNT);
    } finally {
        reservationAdapter.dispose();
    }
});

test("reservations passed to the adapter without precision take the precision of their network", () => {
    console.log("\n=== ADAPTER RESERVATIONS USE THE NETWORK PRECISION ===");

    const createReservationInput = (
        networkId: string,
    ): ITransactionReservationInput => ({
        id: `reservation-${networkId}`,
        networkId,
        accountId: "account-id",
        pendingAmount: "1000",
        expirationTime: Date.now() + RESERVATION_LIFETIME_MS,
        kind: "deploy",
        details: {
            deployId: `deploy-${networkId}`,
            timestamp: new Date(),
            from: "sender-address",
        },
    });

    const reservationAdapter: ReservationAdapter = new ReservationAdapter([
        createReservationInput(NATIVE_18_NETWORK),
        createReservationInput(NATIVE_8_NETWORK),
    ]);

    try {
        const native18Reservation: ITransactionReservation =
            reservationAdapter.getReservation(
                `reservation-${NATIVE_18_NETWORK}`,
            );
        const native8Reservation: ITransactionReservation =
            reservationAdapter.getReservation(`reservation-${NATIVE_8_NETWORK}`);

        console.log(
            "    Precision by network:",
            native18Reservation.nativeTokenDecimals,
            native8Reservation.nativeTokenDecimals,
        );

        assert.equal(
            native18Reservation.nativeTokenDecimals,
            NATIVE_18_DECIMALS,
        );
        assert.equal(native8Reservation.nativeTokenDecimals, NATIVE_8_DECIMALS);
    } finally {
        reservationAdapter.dispose();
    }
});

test("invalid updates fail before configuration is written", async () => {
    console.log("\n=== INVALID PRECISION UPDATES ARE REJECTED ===");

    const custom: INetworkRecord = await addCustomNetwork();

    for (const nativeTokenDecimals of INVALID_NATIVE_TOKEN_DECIMALS) {
        console.log("    Rejecting precision:", nativeTokenDecimals);

        await assert.rejects(
            client.updateNetwork(custom.id, {
                config: { nativeTokenDecimals },
            }),
            INVALID_NATIVE_TOKEN_DECIMALS_ERROR,
        );

        assert.equal(getNetworkDecimals(custom.id), NATIVE_18_DECIMALS);
    }

    await client.updateNetwork(custom.id, {
        config: { nativeTokenDecimals: undefined },
    });

    console.log(
        "    Decimals after an empty update:",
        getNetworkDecimals(custom.id),
    );

    assert.equal(getNetworkDecimals(custom.id), NATIVE_18_DECIMALS);
});

test("history queries bind endpoints and precision-independent recorded amounts to the requested network", async () => {
    console.log("\n=== HISTORY IS READ FROM THE REQUESTED NETWORK ===");

    const accountDataService: AccountDataService = new AccountDataService();

    const native8History: Transaction[] =
        await accountDataService.getTransactionHistory(
            HISTORY_ADDRESS,
            HISTORY_PUBLIC_KEY,
            {},
            NATIVE_8_NETWORK,
        );

    console.log("    8-decimal history amount:", native8History[0].amount);

    assert.equal(client.getCurrentNetworkId(), NATIVE_18_NETWORK);
    assert.equal(native8History[0].networkId, NATIVE_8_NETWORK);
    assert.equal(native8History[0].amount, NATIVE_8_HISTORY_AMOUNT);

    const native18History: Transaction[] =
        await accountDataService.getTransactionHistory(
            HISTORY_ADDRESS,
            HISTORY_PUBLIC_KEY,
            {},
            NATIVE_18_NETWORK,
        );

    console.log("    18-decimal history amount:", native18History[0].amount);

    assert.equal(native18History[0].amount, WIDE_AMOUNT);
});

test("history without a network id is read through the injected node API provider", async () => {
    console.log("\n=== HISTORY USES THE INJECTED PROVIDER ===");

    const native8Api: NodeApiAdapter =
        ApiClientManager.getInstance().createNetworkContext(
            NATIVE_8_NETWORK,
        ).api;
    const nodeApiProvider: NodeApiProvider = {
        getApi: () => native8Api,
    } as unknown as NodeApiProvider;

    const accountDataService: AccountDataService = new AccountDataService(
        nodeApiProvider,
    );

    const providerHistory: Transaction[] =
        await accountDataService.getTransactionHistory(
            HISTORY_ADDRESS,
            HISTORY_PUBLIC_KEY,
        );

    console.log("    Provider history amount:", providerHistory[0].amount);

    assert.equal(client.getCurrentNetworkId(), NATIVE_18_NETWORK);
    assert.equal(providerHistory[0].amount, NATIVE_8_HISTORY_AMOUNT);

    const requestedHistory: Transaction[] =
        await accountDataService.getTransactionHistory(
            HISTORY_ADDRESS,
            HISTORY_PUBLIC_KEY,
            {},
            NATIVE_18_NETWORK,
        );

    console.log("    Requested history amount:", requestedHistory[0].amount);

    assert.equal(requestedHistory[0].amount, WIDE_AMOUNT);
});
