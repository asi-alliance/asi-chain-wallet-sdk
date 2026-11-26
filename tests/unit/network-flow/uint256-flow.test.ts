import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PHLO_LIMIT, DEFAULT_PHLO_PRICE } from "@config/index";
import Account from "@domains/Account";
import Asset, { getNativeAsset } from "@domains/Asset";
import Client from "@domains/Client";
import { BalanceUnavailableError } from "@domains/CustomError";
import ReservationAdapter, {
    IReservedOperationResult,
} from "@domains/ReservationAdapter";
import { ITransactionReservation } from "@domains/Transaction";
import Wallet from "@domains/Wallet";
import { SignedResult } from "@services/Signer";
import {
    ITransferDetails,
    TDeployDetails,
} from "@services/TransactionService";
import { MAX_UINT256 } from "@utils/constants";
import { IPrecisionNode, startPrecisionNode } from "./precisionNode";

interface IFundedWallet {
    wallet: Wallet;
    account: Account;
    request: { walletId: string; accountId: string };
}

interface IMinPhloPriceStatusCase {
    status: unknown;
    minPhloPrice: bigint;
}

const PASSWORD: string = "uint256-fixture-password";

const STORAGE_OPTIONS = { nodeStorageDir: ".tmp/uint256-flow" };

const WIDE_NETWORK: string = "Wide";

const NATIVE_TOKEN_DECIMALS: number = 18;

const INITIAL_BALANCE: bigint = 100000000000000000000n;

const DEPLOY_TERM: string = "Nil";

const WIDE_PHLO_PRICE: string = "9007199254740993";
const WIDE_DEPLOY_PHLO_LIMIT: number = 2;

const PHLO_CHARGE_OVERFLOW_ERROR: RegExp = /charge exceeds/;

const TRANSFER_AMOUNT: bigint = 1n;
const TRANSFER_PHLO_LIMIT: number = 2;
const DEPLOY_PHLO_LIMIT: number = 3;
const STARTING_PHLO_PRICE: number = 1;
const CHANGED_PHLO_PRICE: number = 100;

const MALFORMED_BALANCE: string = "1e2";

const NODE_API_STATUS_PATH: string = "/api/status";

const NODE_MIN_PHLO_PRICE: string = "100000000000";
const BELOW_NODE_MIN_PHLO_PRICE: string = "99999999999";
const SCALA_MIN_PHLO_PRICE: number = 100;
const RAISED_MIN_PHLO_PRICE: string = "200000000000";

const MIN_PHLO_CHARGE: bigint =
    BigInt(DEFAULT_PHLO_LIMIT) * BigInt(NODE_MIN_PHLO_PRICE);

const DEFAULT_MIN_PHLO_PRICE: bigint = BigInt(DEFAULT_PHLO_PRICE);

const BELOW_NODE_MIN_PHLO_PRICE_ERROR: RegExp =
    /Phlo price must not be less than the node minimum 100000000000/;

const MIN_PHLO_PRICE_STATUS_CASES: IMinPhloPriceStatusCase[] = [
    {
        status: { minPhloPrice: NODE_MIN_PHLO_PRICE },
        minPhloPrice: BigInt(NODE_MIN_PHLO_PRICE),
    },
    {
        status: { minPhloPrice: SCALA_MIN_PHLO_PRICE },
        minPhloPrice: BigInt(SCALA_MIN_PHLO_PRICE),
    },
    { status: undefined, minPhloPrice: DEFAULT_MIN_PHLO_PRICE },
    { status: {}, minPhloPrice: DEFAULT_MIN_PHLO_PRICE },
    { status: { minPhloPrice: "0" }, minPhloPrice: DEFAULT_MIN_PHLO_PRICE },
    { status: { minPhloPrice: "1e11" }, minPhloPrice: DEFAULT_MIN_PHLO_PRICE },
    { status: { minPhloPrice: 1.5 }, minPhloPrice: DEFAULT_MIN_PHLO_PRICE },
];

let node: IPrecisionNode;
let client: Client;

const createClient = (): Promise<Client> =>
    Client.create({
        networksConfig: { [WIDE_NETWORK]: node.config },
        defaultNetwork: WIDE_NETWORK,
        storageOptions: STORAGE_OPTIONS,
    });

const createFundedWallet = async (): Promise<IFundedWallet> => {
    const wallet: Wallet = await client.createPrivateKeyWallet(
        {
            privateKey: client.generatePrivateKey(),
            accountName: "UInt256 fixture",
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

const getLastSubmittedDeploy = (): SignedResult => {
    const submittedDeploys: SignedResult[] = node.getSubmittedDeploys();

    return submittedDeploys[submittedDeploys.length - 1];
};

const getDeploysSubmittedSince = (submittedCount: number): SignedResult[] =>
    node.getSubmittedDeploys().slice(submittedCount);

const countStatusRequests = (): number =>
    node.requests.filter((url: string) => url === NODE_API_STATUS_PATH).length;

const findReservation = (
    reservations: ITransactionReservation[],
    deployId: string,
): ITransactionReservation | undefined =>
    reservations.find(
        (reservation: ITransactionReservation) =>
            reservation.details.deployId === deployId,
    );

test.before(async () => {
    node = await startPrecisionNode(NATIVE_TOKEN_DECIMALS);
});

test.beforeEach(async () => {
    client = await createClient();

    await client.clearPersistence();
    await client.close();

    client = await createClient();

    node.setBalance(INITIAL_BALANCE);
    node.setStatusResponse(undefined);
});

test.afterEach(async () => {
    await client.close();
});

test.after(async () => {
    await node.close();
});

test("deploy reserves exact wide fees and overflow never reaches HTTP or storage", async () => {
    console.log("\n=== WIDE DEPLOY FEES ===");

    const { request }: IFundedWallet = await createFundedWallet();

    await client.deploy({
        ...request,
        term: DEPLOY_TERM,
        phloLimit: WIDE_DEPLOY_PHLO_LIMIT,
        phloPrice: WIDE_PHLO_PRICE,
    });

    const [reservation]: ITransactionReservation[] =
        await client.getReservations(request.walletId);

    console.log(
        "    Submitted phlo price:",
        getLastSubmittedDeploy().data.phloPrice,
    );
    console.log("    Reserved amount:", reservation.pendingAmount);

    assert.equal(getLastSubmittedDeploy().data.phloPrice, WIDE_PHLO_PRICE);
    assert.equal(
        reservation.pendingAmount,
        (BigInt(WIDE_DEPLOY_PHLO_LIMIT) * BigInt(WIDE_PHLO_PRICE)).toString(),
    );

    const submittedCount: number = node.getSubmittedDeploys().length;

    await assert.rejects(
        client.deploy({
            ...request,
            term: DEPLOY_TERM,
            phloLimit: WIDE_DEPLOY_PHLO_LIMIT,
            phloPrice: MAX_UINT256,
        }),
        PHLO_CHARGE_OVERFLOW_ERROR,
    );

    const reservations: ITransactionReservation[] =
        await client.getReservations(request.walletId);

    console.log(
        "    Submitted deploys after overflow:",
        node.getSubmittedDeploys().length,
    );
    console.log("    Reservations after overflow:", reservations.length);

    assert.equal(node.getSubmittedDeploys().length, submittedCount);
    assert.equal(reservations.length, 1);
});

test("direct reservations sign and reserve the phlo read when the operation starts", async () => {
    console.log("\n=== PHLO IS READ WHEN THE OPERATION STARTS ===");

    const { wallet, account }: IFundedWallet = await createFundedWallet();
    const reservationAdapter: ReservationAdapter = new ReservationAdapter([]);
    const asset: Asset = getNativeAsset(client.getCurrentNetwork().config);

    const transferDetails: ITransferDetails = {
        to: account.getAddress(),
        amount: TRANSFER_AMOUNT,
        asset,
        phloLimit: TRANSFER_PHLO_LIMIT,
        phloPrice: STARTING_PHLO_PRICE,
    };
    const deployDetails: TDeployDetails = {
        term: DEPLOY_TERM,
        phloLimit: DEPLOY_PHLO_LIMIT,
        phloPrice: STARTING_PHLO_PRICE,
    };

    try {
        const transferStartCount: number = node.getSubmittedDeploys().length;

        const transferring: Promise<IReservedOperationResult> =
            reservationAdapter.transfer(
                wallet,
                account.getId(),
                transferDetails,
            );

        transferDetails.phloPrice = CHANGED_PHLO_PRICE;

        await transferring;

        const transferDeploys: SignedResult[] =
            getDeploysSubmittedSince(transferStartCount);

        console.log("    Transfer deploys submitted:", transferDeploys.length);

        assert.equal(transferDeploys.length, 1);

        const [transferDeploy]: SignedResult[] = transferDeploys;

        const deployStartCount: number = node.getSubmittedDeploys().length;

        const deploying: Promise<IReservedOperationResult> =
            reservationAdapter.deploy(wallet, account.getId(), deployDetails);

        deployDetails.phloPrice = CHANGED_PHLO_PRICE;

        await deploying;

        const deployDeploys: SignedResult[] =
            getDeploysSubmittedSince(deployStartCount);

        console.log("    Deploy deploys submitted:", deployDeploys.length);

        assert.equal(deployDeploys.length, 1);

        const [deployDeploy]: SignedResult[] = deployDeploys;

        const pendingAmounts: string[] = reservationAdapter
            .getReservations()
            .map(
                (reservation: ITransactionReservation) =>
                    reservation.pendingAmount,
            );

        console.log("    Transfer phlo price:", transferDeploy.data.phloPrice);
        console.log("    Deploy term:", deployDeploy.data.term);
        console.log("    Deploy phlo price:", deployDeploy.data.phloPrice);
        console.log("    Reserved amounts:", pendingAmounts);

        assert.notEqual(transferDeploy.data.term, DEPLOY_TERM);
        assert.equal(
            transferDeploy.data.phloPrice,
            String(STARTING_PHLO_PRICE),
        );
        assert.equal(deployDeploy.data.term, DEPLOY_TERM);
        assert.equal(deployDeploy.data.phloPrice, String(STARTING_PHLO_PRICE));
        assert.deepEqual(pendingAmounts, [
            (
                TRANSFER_AMOUNT +
                BigInt(TRANSFER_PHLO_LIMIT * STARTING_PHLO_PRICE)
            ).toString(),
            String(DEPLOY_PHLO_LIMIT * STARTING_PHLO_PRICE),
        ]);
    } finally {
        reservationAdapter.dispose();
    }
});

test("wide balances stay exact and malformed balances never become zero", async () => {
    console.log("\n=== WIDE AND MALFORMED BALANCES ===");

    const { account }: IFundedWallet = await createFundedWallet();

    console.log("    Rejecting balance:", MALFORMED_BALANCE);

    node.setBalanceResponse(MALFORMED_BALANCE);

    await assert.rejects(
        client.getBalance(account.getAddress()),
        BalanceUnavailableError,
    );

    node.setBalance(MAX_UINT256);

    const maxBalance: bigint = await client.getBalance(account.getAddress());

    node.setBalance(0n);

    const zeroBalance: bigint = await client.getBalance(account.getAddress());

    console.log("    Maximum balance:", maxBalance.toString());
    console.log("    Zero balance:", zeroBalance.toString());

    assert.equal(maxBalance, MAX_UINT256);
    assert.equal(zeroBalance, 0n);
});

test("operations without a phlo price sign and reserve the node minimum read once", async () => {
    console.log("\n=== NODE MINIMUM PHLO PRICE ===");

    node.setStatusResponse({ minPhloPrice: NODE_MIN_PHLO_PRICE });

    const { account, request }: IFundedWallet = await createFundedWallet();

    const statusRequestCount: number = countStatusRequests();

    await client.transfer({
        ...request,
        to: account.getAddress(),
        amount: TRANSFER_AMOUNT,
    });

    const transferDeploy: SignedResult = getLastSubmittedDeploy();

    await client.deploy({ ...request, term: DEPLOY_TERM });

    const deployDeploy: SignedResult = getLastSubmittedDeploy();

    const reservations: ITransactionReservation[] =
        await client.getReservations(request.walletId);

    console.log("    Transfer phlo price:", transferDeploy.data.phloPrice);
    console.log("    Deploy phlo price:", deployDeploy.data.phloPrice);
    console.log(
        "    Status requests:",
        countStatusRequests() - statusRequestCount,
    );

    assert.equal(transferDeploy.data.phloPrice, NODE_MIN_PHLO_PRICE);
    assert.equal(deployDeploy.data.phloPrice, NODE_MIN_PHLO_PRICE);
    assert.equal(
        findReservation(reservations, transferDeploy.signature)?.pendingAmount,
        (TRANSFER_AMOUNT + MIN_PHLO_CHARGE).toString(),
    );
    assert.equal(
        findReservation(reservations, deployDeploy.signature)?.pendingAmount,
        MIN_PHLO_CHARGE.toString(),
    );
    assert.equal(client.getTransferGasReserve(), MIN_PHLO_CHARGE);
    assert.equal(countStatusRequests() - statusRequestCount, 1);
});

test("a phlo price below the node minimum is refused before signing", async () => {
    console.log("\n=== PHLO PRICE BELOW THE NODE MINIMUM ===");

    node.setStatusResponse({ minPhloPrice: NODE_MIN_PHLO_PRICE });

    const { request }: IFundedWallet = await createFundedWallet();

    const submittedCount: number = node.getSubmittedDeploys().length;

    await assert.rejects(
        client.deploy({
            ...request,
            term: DEPLOY_TERM,
            phloPrice: BELOW_NODE_MIN_PHLO_PRICE,
        }),
        BELOW_NODE_MIN_PHLO_PRICE_ERROR,
    );
    await assert.rejects(
        client.signDeploy({
            ...request,
            term: DEPLOY_TERM,
            phloPrice: BELOW_NODE_MIN_PHLO_PRICE,
        }),
        BELOW_NODE_MIN_PHLO_PRICE_ERROR,
    );

    const reservations: ITransactionReservation[] =
        await client.getReservations(request.walletId);

    console.log(
        "    Submitted deploys:",
        node.getSubmittedDeploys().length - submittedCount,
    );
    console.log("    Reservations:", reservations.length);

    assert.equal(node.getSubmittedDeploys().length, submittedCount);
    assert.equal(reservations.length, 0);
});

for (const { status, minPhloPrice } of MIN_PHLO_PRICE_STATUS_CASES) {
    test(`node status ${JSON.stringify(status)} gives the minimum phlo price ${minPhloPrice}`, async () => {
        console.log(
            `\n=== MINIMUM PHLO PRICE FROM ${JSON.stringify(status)} ===`,
        );

        node.setStatusResponse(status);

        const nodeMinPhloPrice: bigint = await client.getMinPhloPrice();

        console.log("    Minimum phlo price:", nodeMinPhloPrice.toString());

        assert.equal(nodeMinPhloPrice, minPhloPrice);
    });
}

test("the minimum phlo price is read again after a failed read and after a network switch", async () => {
    console.log("\n=== MINIMUM PHLO PRICE LIFETIME ===");

    const unreadMinPhloPrice: bigint = await client.getMinPhloPrice();

    node.setStatusResponse({ minPhloPrice: NODE_MIN_PHLO_PRICE });

    const firstMinPhloPrice: bigint = await client.getMinPhloPrice();

    node.setStatusResponse({ minPhloPrice: RAISED_MIN_PHLO_PRICE });

    const keptMinPhloPrice: bigint = await client.getMinPhloPrice();

    client.setNetwork(WIDE_NETWORK);

    const switchedMinPhloPrice: bigint = await client.getMinPhloPrice();

    console.log("    Without a status:", unreadMinPhloPrice.toString());
    console.log("    First read:", firstMinPhloPrice.toString());
    console.log("    Same network:", keptMinPhloPrice.toString());
    console.log("    After the switch:", switchedMinPhloPrice.toString());

    assert.equal(unreadMinPhloPrice, DEFAULT_MIN_PHLO_PRICE);
    assert.equal(firstMinPhloPrice, BigInt(NODE_MIN_PHLO_PRICE));
    assert.equal(keptMinPhloPrice, BigInt(NODE_MIN_PHLO_PRICE));
    assert.equal(switchedMinPhloPrice, BigInt(RAISED_MIN_PHLO_PRICE));
});
