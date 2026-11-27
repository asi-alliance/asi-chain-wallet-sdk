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

interface IMaxPhloLimitStatusCase {
    status: unknown;
    maxPhloLimit: bigint | null;
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

const NODE_MAX_PHLO_LIMIT: string = "20000000";
const ABOVE_NODE_MAX_PHLO_LIMIT: number = 20000001;
const LOW_NODE_MAX_PHLO_LIMIT: number = 400000;

const ABOVE_NODE_MAX_PHLO_LIMIT_ERROR: RegExp =
    /Phlo limit 20000001 must not be greater than the node maximum 20000000/;

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

const MAX_PHLO_LIMIT_STATUS_CASES: IMaxPhloLimitStatusCase[] = [
    {
        status: { maxPhloLimit: NODE_MAX_PHLO_LIMIT },
        maxPhloLimit: BigInt(NODE_MAX_PHLO_LIMIT),
    },
    {
        status: { maxPhloLimit: LOW_NODE_MAX_PHLO_LIMIT },
        maxPhloLimit: BigInt(LOW_NODE_MAX_PHLO_LIMIT),
    },
    { status: undefined, maxPhloLimit: null },
    { status: {}, maxPhloLimit: null },
    { status: { maxPhloLimit: "0" }, maxPhloLimit: null },
    { status: { maxPhloLimit: "2e7" }, maxPhloLimit: null },
    { status: { maxPhloLimit: 1.5 }, maxPhloLimit: null },
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

test("a phlo limit up to the node maximum is signed and a limit above it is refused before signing and reserving", async () => {
    console.log("\n=== PHLO LIMIT AGAINST THE NODE MAXIMUM ===");

    node.setStatusResponse({
        minPhloPrice: NODE_MIN_PHLO_PRICE,
        maxPhloLimit: NODE_MAX_PHLO_LIMIT,
    });

    const { wallet, account, request }: IFundedWallet = await createFundedWallet();
    const reservationAdapter: ReservationAdapter = new ReservationAdapter([]);

    try {
        await client.deploy({
            ...request,
            term: DEPLOY_TERM,
            phloLimit: Number(NODE_MAX_PHLO_LIMIT),
        });

        const maxLimitDeploy: SignedResult = getLastSubmittedDeploy();

        await client.deploy({ ...request, term: DEPLOY_TERM });

        const defaultLimitDeploy: SignedResult = getLastSubmittedDeploy();

        const submittedCount: number = node.getSubmittedDeploys().length;

        await assert.rejects(
            client.deploy({
                ...request,
                term: DEPLOY_TERM,
                phloLimit: ABOVE_NODE_MAX_PHLO_LIMIT,
            }),
            ABOVE_NODE_MAX_PHLO_LIMIT_ERROR,
        );
        await assert.rejects(
            client.signDeploy({
                ...request,
                term: DEPLOY_TERM,
                phloLimit: ABOVE_NODE_MAX_PHLO_LIMIT,
            }),
            ABOVE_NODE_MAX_PHLO_LIMIT_ERROR,
        );
        await assert.rejects(
            reservationAdapter.transfer(wallet, account.getId(), {
                to: account.getAddress(),
                amount: TRANSFER_AMOUNT,
                asset: getNativeAsset(client.getCurrentNetwork().config),
                phloLimit: ABOVE_NODE_MAX_PHLO_LIMIT,
            }),
            ABOVE_NODE_MAX_PHLO_LIMIT_ERROR,
        );
        assert.throws(
            () =>
                ReservationAdapter.getTransferGasReserve({
                    phloLimit: ABOVE_NODE_MAX_PHLO_LIMIT,
                }),
            ABOVE_NODE_MAX_PHLO_LIMIT_ERROR,
        );

        const reservations: ITransactionReservation[] =
            await client.getReservations(request.walletId);

        console.log("    Maximum limit signed:", maxLimitDeploy.data.phloLimit);
        console.log(
            "    Default limit signed:",
            defaultLimitDeploy.data.phloLimit,
        );
        console.log(
            "    Submitted deploys above the maximum:",
            node.getSubmittedDeploys().length - submittedCount,
        );
        console.log("    Reservations:", reservations.length);
        console.log(
            "    Adapter reservations:",
            reservationAdapter.getReservations().length,
        );

        assert.equal(
            maxLimitDeploy.data.phloLimit,
            Number(NODE_MAX_PHLO_LIMIT),
        );
        assert.equal(defaultLimitDeploy.data.phloLimit, DEFAULT_PHLO_LIMIT);
        assert.equal(node.getSubmittedDeploys().length, submittedCount);
        assert.equal(reservations.length, 2);
        assert.equal(reservationAdapter.getReservations().length, 0);
    } finally {
        reservationAdapter.dispose();
    }
});

test("a node maximum below the default phlo limit is signed and reserved as the limit", async () => {
    console.log("\n=== NODE MAXIMUM BELOW THE DEFAULT PHLO LIMIT ===");

    node.setStatusResponse({
        minPhloPrice: NODE_MIN_PHLO_PRICE,
        maxPhloLimit: LOW_NODE_MAX_PHLO_LIMIT,
    });

    const { account, request }: IFundedWallet = await createFundedWallet();

    const statusRequestCount: number = countStatusRequests();

    const lowMaxPhloCharge: bigint =
        BigInt(LOW_NODE_MAX_PHLO_LIMIT) * BigInt(NODE_MIN_PHLO_PRICE);

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

    console.log("    Transfer phlo limit:", transferDeploy.data.phloLimit);
    console.log("    Deploy phlo limit:", deployDeploy.data.phloLimit);
    console.log(
        "    Status requests:",
        countStatusRequests() - statusRequestCount,
    );

    assert.equal(transferDeploy.data.phloLimit, LOW_NODE_MAX_PHLO_LIMIT);
    assert.equal(deployDeploy.data.phloLimit, LOW_NODE_MAX_PHLO_LIMIT);
    assert.equal(
        findReservation(reservations, transferDeploy.signature)?.pendingAmount,
        (TRANSFER_AMOUNT + lowMaxPhloCharge).toString(),
    );
    assert.equal(
        findReservation(reservations, deployDeploy.signature)?.pendingAmount,
        lowMaxPhloCharge.toString(),
    );
    assert.equal(client.getTransferGasReserve(), lowMaxPhloCharge);
    assert.equal(countStatusRequests() - statusRequestCount, 1);
});

test("without a node maximum any safe phlo limit is signed", async () => {
    console.log("\n=== NO NODE MAXIMUM ===");

    node.setStatusResponse({ minPhloPrice: SCALA_MIN_PHLO_PRICE });

    const { request }: IFundedWallet = await createFundedWallet();

    await client.deploy({
        ...request,
        term: DEPLOY_TERM,
        phloLimit: ABOVE_NODE_MAX_PHLO_LIMIT,
    });

    const nodeMaxPhloLimit: bigint | null = await client.getMaxPhloLimit();

    console.log(
        "    Signed phlo limit:",
        getLastSubmittedDeploy().data.phloLimit,
    );
    console.log("    Node maximum:", nodeMaxPhloLimit);

    assert.equal(
        getLastSubmittedDeploy().data.phloLimit,
        ABOVE_NODE_MAX_PHLO_LIMIT,
    );
    assert.equal(nodeMaxPhloLimit, null);
});

for (const { status, maxPhloLimit } of MAX_PHLO_LIMIT_STATUS_CASES) {
    test(`node status ${JSON.stringify(status)} gives the maximum phlo limit ${maxPhloLimit}`, async () => {
        console.log(
            `\n=== MAXIMUM PHLO LIMIT FROM ${JSON.stringify(status)} ===`,
        );

        node.setStatusResponse(status);

        const nodeMaxPhloLimit: bigint | null = await client.getMaxPhloLimit();

        console.log("    Maximum phlo limit:", nodeMaxPhloLimit);

        assert.equal(nodeMaxPhloLimit, maxPhloLimit);
    });
}

test("a malformed node maximum keeps the node minimum phlo price from the same status", async () => {
    console.log("\n=== MALFORMED NODE MAXIMUM ===");

    node.setStatusResponse({
        minPhloPrice: NODE_MIN_PHLO_PRICE,
        maxPhloLimit: "0",
    });

    const statusRequestCount: number = countStatusRequests();

    const nodeMinPhloPrice: bigint = await client.getMinPhloPrice();
    const nodeMaxPhloLimit: bigint | null = await client.getMaxPhloLimit();

    console.log("    Minimum phlo price:", nodeMinPhloPrice.toString());
    console.log("    Maximum phlo limit:", nodeMaxPhloLimit);
    console.log(
        "    Status requests:",
        countStatusRequests() - statusRequestCount,
    );

    assert.equal(nodeMinPhloPrice, BigInt(NODE_MIN_PHLO_PRICE));
    assert.equal(nodeMaxPhloLimit, null);
    assert.equal(countStatusRequests() - statusRequestCount, 1);
});

test("the maximum phlo limit is read with the minimum price and again after a network switch", async () => {
    console.log("\n=== MAXIMUM PHLO LIMIT LIFETIME ===");

    node.setStatusResponse({
        minPhloPrice: NODE_MIN_PHLO_PRICE,
        maxPhloLimit: NODE_MAX_PHLO_LIMIT,
    });

    const statusRequestCount: number = countStatusRequests();

    const [firstMinPhloPrice, firstMaxPhloLimit]: [bigint, bigint | null] =
        await Promise.all([
            client.getMinPhloPrice(),
            client.getMaxPhloLimit(),
        ]);

    const sharedStatusRequests: number =
        countStatusRequests() - statusRequestCount;

    node.setStatusResponse({
        minPhloPrice: NODE_MIN_PHLO_PRICE,
        maxPhloLimit: LOW_NODE_MAX_PHLO_LIMIT,
    });

    const keptMaxPhloLimit: bigint | null = await client.getMaxPhloLimit();

    client.setNetwork(WIDE_NETWORK);

    const switchedMaxPhloLimit: bigint | null = await client.getMaxPhloLimit();

    console.log("    First read:", firstMinPhloPrice, firstMaxPhloLimit);
    console.log("    Status requests for both:", sharedStatusRequests);
    console.log("    Same network:", keptMaxPhloLimit);
    console.log("    After the switch:", switchedMaxPhloLimit);

    assert.equal(firstMinPhloPrice, BigInt(NODE_MIN_PHLO_PRICE));
    assert.equal(firstMaxPhloLimit, BigInt(NODE_MAX_PHLO_LIMIT));
    assert.equal(sharedStatusRequests, 1);
    assert.equal(keptMaxPhloLimit, BigInt(NODE_MAX_PHLO_LIMIT));
    assert.equal(switchedMaxPhloLimit, BigInt(LOW_NODE_MAX_PHLO_LIMIT));
});
