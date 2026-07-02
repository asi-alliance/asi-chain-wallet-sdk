import test from "node:test";
import assert from "node:assert/strict";
import Wallet from "@domains/Wallet";
import Account from "@domains/Account";
import SecretsProvider from "@domains/SecretsProvider";
import StorageManager from "@services/StorageManager";
import ApiClientManager from "@domains/ApiClientManager";
import ReservationAdapter from "@domains/ReservationAdapter";
import { AccountsStorageRepository } from "@domains/AccountsStorageRepository";
import { SignersStorageRepository } from "@domains/SignersStorageRepository";
import { TransactionReservationsStorageRepository } from "@domains/TransactionReservationsStorageRepository";
import { ITransactionReservation } from "@domains/Transaction";
import { IBalanceData } from "@services/AssetsService";
import { DEFAULT_ASSET } from "@config/index";
import { IDeployWatchCallbacks } from "@services/DeployStatusPoller";

const PASSWORD = "12345678";
const NODE_STORAGE_DIR = "./storage-test";

const SOURCE_SIGNER_ID = "res_1782826781716_f2c3c000";
const DESTINATION_SIGNER_ID = "res_1782826781767_3aba070a";

const TRANSFER_AMOUNTS: bigint[] = [100n, 100n, 100n];

const MONITOR_TIMEOUT_MS = 6 * 60 * 1000;
const MONITOR_POLL_MS = 5000;
const SOURCE_BALANCE_LOG_INTERVAL_MS = 20 * 1000;
const TRANSFER_INTERVAL_MS = 30 * 1000;

const RESTART_CREATE_PHASE = false;
const RESTART_OBSERVE_PHASE = true;

const passwordProvider = new SecretsProvider(() => ({ password: PASSWORD }));

const watchCallbacks: IDeployWatchCallbacks = {
    onStatus: (status, deployId) =>
        console.log(
            `[reservation ${deployId.slice(0, 12)}] poll status: ${status.status}`,
        ),
    onConfirmed: (result) =>
        console.log(
            `[reservation ${result.deployId.slice(0, 12)}] deploy confirmed`,
        ),
};

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

function logReservations(
    label: string,
    reservations: ITransactionReservation[],
): void {
    console.log(`\n[${label}] reservations in manager: ${reservations.length}`);

    reservations.forEach((reservation: ITransactionReservation, index) => {
        console.log(`   #${index}`, {
            id: reservation.id,
            deployId: reservation.deployId,
            accountAddress: reservation.accountAddress,
            pendingAmount: reservation.pendingAmount,
            expiresInMs: reservation.expirationTime - Date.now(),
        });
    });
}

ApiClientManager.getInstance().initialize(
    {
        DevNet: {
            ValidatorURL:
                "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/bb93eaa595aaddf6912e372debc73eef/endpoint_0/HTTP_API",
            ReadOnlyURL:
                "https://ihmps4dkpg.execute-api.us-east-1.amazonaws.com/prod/bb93eaa595aaddf6912e372debc73eef/endpoint_0/HTTP_API",
            IndexerURL: "https://indexer.dev.asichain.io/v1/graphql",
        },
        Dev: {
            ValidatorURL: "http://202.181.159.96:40423",
            ReadOnlyURL: "http://202.181.159.96:40453",
            IndexerURL:
                "https://indexer.asi-chain.singularitynet.dev/v1/graphql",
        },
        MainNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
        TestNet: { ValidatorURL: "", ReadOnlyURL: "", IndexerURL: "" },
    },
    "DevNet",
);

AccountsStorageRepository.getInstance({ nodeStorageDir: NODE_STORAGE_DIR });
SignersStorageRepository.getInstance({ nodeStorageDir: NODE_STORAGE_DIR });
TransactionReservationsStorageRepository.getInstance({
    nodeStorageDir: NODE_STORAGE_DIR,
});

test("transaction reservations lifecycle", async () => {
    console.log("\n=== TRANSACTION RESERVATIONS TEST ===");

    //
    // 1. RESTORE WALLETS (same signer ids as wallet-deploy test)
    //

    const sourceWallet: Wallet = await StorageManager.getWallet({
        signerId: SOURCE_SIGNER_ID,
        passwordProvider,
    });

    const destinationWallet: Wallet = await StorageManager.getWallet({
        signerId: DESTINATION_SIGNER_ID,
        passwordProvider,
    });

    const sourceAccount: Account = sourceWallet.getActiveAccount()!;
    const destinationAccount: Account = destinationWallet.getActiveAccount()!;
    const destinationAddress = destinationAccount.getAddress();

    console.log("Source address:     ", sourceAccount.getAddress());
    console.log("Destination address:", destinationAddress);

    const initialDestinationBalance: bigint = (
        await destinationAccount.getBalance()
    ).amount;

    console.log(
        "Initial destination balance:",
        initialDestinationBalance.toString(),
    );

    //
    // 2. BUILD ADAPTER (restores persisted reservations, drops expired)
    //

    const adapter: ReservationAdapter = await ReservationAdapter.create(
        sourceWallet,
        passwordProvider,
        {
            watchCallbacks,
        },
    );

    logReservations("after create()", adapter.getReservations());

    const initialBalance: IBalanceData =
        await adapter.getBalance(sourceAccount);

    console.log(
        "\nInitial available balance:",
        initialBalance.amount.toString(),
    );

    //
    // 3. SEND MULTIPLE DEPLOYS
    //

    const deployIds: string[] = [];

    for (let index = 0; index < TRANSFER_AMOUNTS.length; index++) {
        const amount: bigint = TRANSFER_AMOUNTS[index];

        console.log(`\n--- transfer #${index} (amount=${amount}) ---`);

        const deployId: string = await adapter.transfer(
            sourceWallet,
            {
                to: destinationAddress,
                amount,
                asset: DEFAULT_ASSET,
            },
            passwordProvider,
        );

        deployIds.push(deployId);

        console.log("deployId:", deployId);

        const available: bigint = (await adapter.getBalance(sourceAccount))
            .amount;
        const onChain: bigint = (await sourceAccount.getBalance()).amount;

        console.log(
            `[source] available=${available.toString()} | on-chain=${onChain.toString()} | reserved=${(
                onChain - available
            ).toString()}`,
        );

        logReservations(`after transfer #${index}`, adapter.getReservations());

        if (index < TRANSFER_AMOUNTS.length - 1) {
            console.log(
                `\n... waiting ${TRANSFER_INTERVAL_MS / 1000}s before next transfer ...`,
            );

            await sleep(TRANSFER_INTERVAL_MS);
        }
    }

    assert.equal(
        adapter.getReservations().length,
        TRANSFER_AMOUNTS.length,
        "all submitted transfers must be held as reservations",
    );

    //
    // 4. MONITOR MANAGER CLEANUP (confirmed / expired)
    //

    console.log("\n=== MONITORING MANAGER CLEANUP ===");

    const deadline: number = Date.now() + MONITOR_TIMEOUT_MS;
    let previousCount: number = adapter.getReservations().length;
    let lastSourceBalanceLogAt: number = 0;

    while (adapter.getReservations().length > 0 && Date.now() < deadline) {
        await sleep(MONITOR_POLL_MS);

        const current: ITransactionReservation[] = adapter.getReservations();

        if (
            Date.now() - lastSourceBalanceLogAt >=
            SOURCE_BALANCE_LOG_INTERVAL_MS
        ) {
            const availableBalance: bigint = (
                await adapter.getBalance(sourceAccount)
            ).amount;

            const onChainBalance: bigint = (await sourceAccount.getBalance())
                .amount;

            console.log(
                `[source] available=${availableBalance.toString()} | on-chain=${onChainBalance.toString()} | from reservations=${availableBalance !== onChainBalance}`,
            );

            lastSourceBalanceLogAt = Date.now();
        }

        if (current.length !== previousCount) {
            console.log(
                `[cleanup] reservations changed: ${previousCount} -> ${current.length}`,
            );

            logReservations("current", current);

            const destinationBalance: bigint = (
                await destinationAccount.getBalance()
            ).amount;

            console.log(
                `[destination] balance after cleanup: ${destinationBalance.toString()}`,
            );

            previousCount = current.length;
        } else {
            console.log(
                `[monitor] still ${current.length} reservation(s) held...`,
            );
        }
    }

    console.log(
        "\nFinal reservations in manager:",
        adapter.getReservations().length,
    );

    const finalDestinationBalance: bigint = (
        await destinationAccount.getBalance()
    ).amount;

    console.log("\n=== DESTINATION BALANCE CHANGE ===");
    console.log("Initial:", initialDestinationBalance.toString());
    console.log("Final:  ", finalDestinationBalance.toString());
    console.log(
        "Delta:  ",
        (finalDestinationBalance - initialDestinationBalance).toString(),
    );

    //
    // ASSERTIONS
    //

    assert.ok(sourceAccount.getAddress());
    assert.notEqual(sourceAccount.getAddress(), destinationAddress);
    assert.equal(deployIds.length, TRANSFER_AMOUNTS.length);

    console.log("\n=== TEST PASSED ===");
});

//TEST FOR CHECK READ RESERVATIONS THROUGH STORAGE

// test("transaction reservations survive restart", async () => {
//     console.log("\n=== RESERVATIONS RESTART TEST ===");

//     const sourceWallet: Wallet = await StorageManager.getWallet({
//         signerId: SOURCE_SIGNER_ID,
//         passwordProvider,
//     });

//     const sourceAccount: Account = sourceWallet.getActiveAccount()!;

//     console.log("Source address:", sourceAccount.getAddress());

//     //
//     // PART 1 — CREATE & PERSIST THREE TRANSFERS
//     // (run first with RESTART_OBSERVE_PHASE=false, then wait ~30s)
//     //

//     if (RESTART_CREATE_PHASE) {
//         console.log("\n--- PART 1: create & persist transfers ---");

//         const destinationWallet: Wallet = await StorageManager.getWallet({
//             signerId: DESTINATION_SIGNER_ID,
//             passwordProvider,
//         });

//         const destinationAddress = destinationWallet
//             .getActiveAccount()!
//             .getAddress();

//         const adapter: ReservationAdapter = await ReservationAdapter.create(
//             sourceWallet,
//             passwordProvider,
//         );

//         for (let index = 0; index < TRANSFER_AMOUNTS.length; index++) {
//             const amount: bigint = TRANSFER_AMOUNTS[index];

//             const deployId: string = await adapter.transfer(
//                 sourceWallet,
//                 {
//                     to: destinationAddress,
//                     amount,
//                     asset: DEFAULT_ASSET,
//                 },
//                 passwordProvider,
//             );

//             console.log(
//                 `transfer #${index} (amount=${amount}) deployId:`,
//                 deployId,
//             );
//         }

//         logReservations(
//             "created & persisted to storage",
//             adapter.getReservations(),
//         );

//         // stop pollers/timers so the process exits cleanly; persisted records stay in storage
//         adapter.dispose();

//         console.log(
//             "\nPART 1 done — reservations persisted. Re-run with RESTART_CREATE_PHASE=false, RESTART_OBSERVE_PHASE=true within 5 min.",
//         );
//     }

//     //
//     // PART 2 — RESTORE FROM STORAGE & OBSERVE
//     // (run ~30s after PART 1 with RESTART_CREATE_PHASE=false)
//     //

//     if (RESTART_OBSERVE_PHASE) {
//         console.log("\n--- PART 2: restore from storage & observe ---");

//         const adapter: ReservationAdapter = await ReservationAdapter.create(
//             sourceWallet,
//             passwordProvider,
//         );

//         logReservations("restored from storage", adapter.getReservations());

//         const restoredAvailable: bigint = (
//             await adapter.getBalance(sourceAccount)
//         ).amount;
//         const restoredOnChain: bigint = (await sourceAccount.getBalance())
//             .amount;

//         console.log(
//             `[source] available=${restoredAvailable.toString()} | on-chain=${restoredOnChain.toString()} | reserved=${(
//                 restoredOnChain - restoredAvailable
//             ).toString()}`,
//         );

//         console.log("\n=== MONITORING RESTORED RESERVATIONS ===");

//         const deadline: number = Date.now() + MONITOR_TIMEOUT_MS;
//         let previousCount: number = adapter.getReservations().length;

//         while (adapter.getReservations().length > 0 && Date.now() < deadline) {
//             await sleep(MONITOR_POLL_MS);

//             const current: ITransactionReservation[] =
//                 adapter.getReservations();

//             if (current.length !== previousCount) {
//                 console.log(
//                     `[cleanup] reservations changed: ${previousCount} -> ${current.length}`,
//                 );

//                 const available: bigint = (
//                     await adapter.getBalance(sourceAccount)
//                 ).amount;
//                 const onChain: bigint = (await sourceAccount.getBalance())
//                     .amount;

//                 console.log(
//                     `[source] available=${available.toString()} | on-chain=${onChain.toString()} | reserved=${(
//                         onChain - available
//                     ).toString()}`,
//                 );

//                 previousCount = current.length;
//             } else {
//                 console.log(
//                     `[monitor] still ${current.length} reservation(s) held...`,
//                 );
//             }
//         }

//         console.log(
//             "\nFinal reservations in manager:",
//             adapter.getReservations().length,
//         );
//     }

//     assert.ok(sourceAccount.getAddress());

//     console.log("\n=== RESTART TEST DONE ===");
// });
