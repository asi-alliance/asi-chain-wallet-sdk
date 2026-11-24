import test from "node:test";
import assert from "node:assert/strict";

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

test.before(async () => {
    node = await startPrecisionNode(NATIVE_TOKEN_DECIMALS);
});

test.beforeEach(async () => {
    client = await createClient();

    await client.clearPersistence();
    await client.close();

    client = await createClient();

    node.setBalance(INITIAL_BALANCE);
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
