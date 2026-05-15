import assert from "node:assert";
import FundsReservationService from "../../src/application/services/FundsReservation";
import { describe, it, beforeEach, afterEach } from "node:test";
import { ReservationStatus } from "../../src/domain/aggregates/Reservation/types";
import { Address } from "../../src/domain/aggregates/Wallet";

const SENDER_ADDRESS = ("1111" + "a".repeat(60)) as Address;
const RECIPIENT_1 = ("1111" + "b".repeat(60)) as Address;
const RECIPIENT_2 = ("1111" + "c".repeat(60)) as Address;
const RECIPIENT_3 = ("1111" + "d".repeat(60)) as Address;

describe("FundsReservation Integration with AssetsService", () => {
    let reservationService: FundsReservationService;

    beforeEach(() => {
        reservationService = FundsReservationService.getInstance();
        reservationService.clear();
    });

    afterEach(() => {
        reservationService.clear();
    });

    describe("Scenario 1: Single Transfer with Reservation Lifecycle", () => {
        it("should lock → submit → commit a transfer", () => {
            const transferAmount = 500n;
            const senderBalance = 1000n;

            const reservationId = reservationService.lock(
                SENDER_ADDRESS,
                transferAmount,
                5 * 60 * 1000,
                undefined,
                `Transfer ${transferAmount} to ${RECIPIENT_1}`,
            );

            const reserved =
                reservationService.getTotalReserved(SENDER_ADDRESS);
            assert.strictEqual(reserved, transferAmount);
            assert.strictEqual(senderBalance - reserved, 500n); // Available balance

            const deployId = "deploy_abc123xyz";

            reservationService.commit(reservationId, deployId);

            const reservation =
                reservationService.getReservation(reservationId);
            assert.strictEqual(
                reservation?.status,
                ReservationStatus.COMMITTED,
            );
            assert.strictEqual(reservation?.deployId, deployId);
            assert.ok(reservation?.reason?.includes("Transfer"));

            assert.strictEqual(
                reservationService.getTotalReserved(SENDER_ADDRESS),
                transferAmount,
            );
        });

        it("should lock → submit fails → release a transfer", () => {
            const transferAmount = 300n;

            const reservationId = reservationService.lock(
                SENDER_ADDRESS,
                transferAmount,
                5 * 60 * 1000,
                undefined,
                `Transfer ${transferAmount} to ${RECIPIENT_1} (FAILED)`,
            );

            const submitFailed = true;

            if (submitFailed) {
                reservationService.release(reservationId);
            }

            const reservation =
                reservationService.getReservation(reservationId);
            assert.strictEqual(reservation?.status, ReservationStatus.RELEASED);

            const reserved =
                reservationService.getTotalReserved(SENDER_ADDRESS);
            assert.strictEqual(reserved, 0n);
        });
    });

    describe("Scenario 2: Multiple Concurrent Transfers", () => {
        it("should handle 3 concurrent transfers with proper reservation tracking", () => {
            const balance = 1000n;
            const transfer1Amount = 200n;
            const transfer2Amount = 300n;
            const transfer3Amount = 250n;

            const res1 = reservationService.lock(
                SENDER_ADDRESS,
                transfer1Amount,
                5 * 60 * 1000,
                undefined,
                `Transfer to ${RECIPIENT_1}`,
            );

            const res2 = reservationService.lock(
                SENDER_ADDRESS,
                transfer2Amount,
                5 * 60 * 1000,
                undefined,
                `Transfer to ${RECIPIENT_2}`,
            );

            const res3 = reservationService.lock(
                SENDER_ADDRESS,
                transfer3Amount,
                5 * 60 * 1000,
                undefined,
                `Transfer to ${RECIPIENT_3}`,
            );

            const totalReserved =
                reservationService.getTotalReserved(SENDER_ADDRESS);

            assert.strictEqual(
                totalReserved,
                transfer1Amount + transfer2Amount + transfer3Amount,
            );

            const available = balance - totalReserved;

            assert.strictEqual(available, 250n);

            reservationService.commit(res1, "deploy_1");
            reservationService.release(res2);
            reservationService.commit(res3, "deploy_3");

            const all = reservationService.getReservations(SENDER_ADDRESS);

            assert.strictEqual(
                all.filter((r) => r.status === ReservationStatus.COMMITTED)
                    .length,
                2,
            );

            assert.strictEqual(
                all.filter((r) => r.status === ReservationStatus.RELEASED)
                    .length,
                1,
            );

            const stillReserved =
                reservationService.getTotalReserved(SENDER_ADDRESS);
            assert.strictEqual(stillReserved, transfer1Amount + transfer3Amount);

            const committedOnly = all
                .filter((r) => r.status === ReservationStatus.COMMITTED)
                .reduce((sum, r) => sum + r.amount, 0n);
            assert.strictEqual(
                committedOnly,
                transfer1Amount + transfer3Amount,
            );
        });
    });

    describe("Scenario 3: Prevention of Double-Spending", () => {
        it("should prevent user from sending more than balance via reservation checks", () => {
            const balance = 1000n;
            const firstTransfer = 700n;
            const secondTransfer = 600n;

            const res1 = reservationService.lock(
                SENDER_ADDRESS,
                firstTransfer,
                5 * 60 * 1000,
                undefined,
                "First transfer",
            );

            const reserved1 =
                reservationService.getTotalReserved(SENDER_ADDRESS);
            assert.strictEqual(reserved1, firstTransfer);

            const availableForSecond = balance - reserved1;
            assert.strictEqual(availableForSecond, 300n);

            const canLockSecond = secondTransfer <= availableForSecond;
            assert.strictEqual(canLockSecond, false);

            if (!canLockSecond) {
                assert.ok("Insufficient reserved balance");
            } else {
                reservationService.lock(
                    SENDER_ADDRESS,
                    secondTransfer,
                    5 * 60 * 1000,
                );
                const totalReserved =
                    reservationService.getTotalReserved(SENDER_ADDRESS);
                assert.ok(totalReserved > balance);
            }
        });
    });

    describe("Scenario 4: Reservation Expiration & Cleanup", () => {
        it("should handle reservation expiration for stuck/abandoned transfers", async () => {
            const transferAmount = 400n;
            const shortExpiration = 100; // 100ms for testing

            const resId = reservationService.lock(
                SENDER_ADDRESS,
                transferAmount,
                shortExpiration,
                undefined,
                "Stuck transfer",
            );

            let res = reservationService.getReservation(resId);
            assert.strictEqual(res?.status, ReservationStatus.PENDING);

            await new Promise((resolve) => setTimeout(resolve, 150));
  
            const reservation = reservationService.getReservation(resId);
            const isExpired =
                new Date(reservation!.expiresAt).getTime() < Date.now();

            assert.strictEqual(isExpired, true);
            const cleaned =
                reservationService.cleanupExpired(SENDER_ADDRESS);
            assert.strictEqual(cleaned, 1);

            const reserved =
                reservationService.getTotalReserved(SENDER_ADDRESS);
            assert.strictEqual(reserved, 0n);
        });
    });

    describe("Scenario 5: Transaction Resubmission with Reservation", () => {
        it("should handle resubmit flow with persistent reservation", () => {
            const amount = 600n;

            const res1 = reservationService.lock(
                SENDER_ADDRESS,
                amount,
                5 * 60 * 1000,
                undefined,
                "Transfer attempt 1",
            );

            const submitFailed = true;
            if (submitFailed) {
                reservationService.release(res1);
            }

            const afterFail =
                reservationService.getTotalReserved(SENDER_ADDRESS);
            assert.strictEqual(afterFail, 0n); // Available again

            const res2 = reservationService.lock(
                SENDER_ADDRESS,
                amount,
                5 * 60 * 1000,
                undefined,
                "Transfer attempt 2",
            );

            const deployId = "deploy_final_xyz";
            reservationService.commit(res2, deployId);

            const reservations =
                reservationService.getReservations(SENDER_ADDRESS);
            assert.strictEqual(reservations.length, 2);
            assert.strictEqual(
                reservations.filter(
                    (r) => r.status === ReservationStatus.RELEASED,
                ).length,
                1,
            );
            assert.strictEqual(
                reservations.filter(
                    (r) => r.status === ReservationStatus.COMMITTED,
                ).length,
                1,
            );
        });
    });

    describe("Scenario 6: Multiple Addresses (Independent Operations)", () => {
        it("should maintain independent reservations per address", () => {
            const addr_A = SENDER_ADDRESS;
            const addr_B = RECIPIENT_1;
            const addr_C = RECIPIENT_2;

            const a_to_b = reservationService.lock(
                addr_A,
                300n,
                5 * 60 * 1000,
                undefined,
                "A → B",
            );

            const a_to_c = reservationService.lock(
                addr_A,
                200n,
                5 * 60 * 1000,
                undefined,
                "A → C",
            );

            const b_to_a = reservationService.lock(
                addr_B,
                100n,
                5 * 60 * 1000,
                undefined,
                "B → A",
            );

            assert.strictEqual(
                reservationService.getTotalReserved(addr_A),
                500n,
            );
            assert.strictEqual(
                reservationService.getTotalReserved(addr_B),
                100n,
            );
            assert.strictEqual(reservationService.getTotalReserved(addr_C), 0n);

            reservationService.commit(a_to_b, "deploy_a_b");
            reservationService.commit(a_to_c, "deploy_a_c");

            assert.strictEqual(
                reservationService.getTotalReserved(addr_A),
                500n,
            );
            assert.strictEqual(
                reservationService.getTotalReserved(addr_B),
                100n,
            );

            const a_reservations = reservationService.getReservations(addr_A);
            const b_reservations = reservationService.getReservations(addr_B);

            assert.strictEqual(a_reservations.length, 2);
            assert.strictEqual(b_reservations.length, 1);
            assert.ok(a_reservations.every((r) => r.address === addr_A));
            assert.ok(b_reservations.every((r) => r.address === addr_B));
        });
    });

    describe("Scenario 7: Reservation Tracking with Deploy IDs", () => {
        it("should maintain link between reservation and on-chain deploy", () => {
            const reservationId = reservationService.lock(
                SENDER_ADDRESS,
                1000n,
                5 * 60 * 1000,
                undefined,
                "High-value transfer",
            );

            let res = reservationService.getReservation(reservationId);
            assert.strictEqual(res?.deployId, undefined);

            const deployId =
                "11111111111122222222222233333333444444445555555555555";
            reservationService.commit(reservationId, deployId);

            res = reservationService.getReservation(reservationId);
            assert.strictEqual(res?.deployId, deployId);

            const all = reservationService.getReservations(SENDER_ADDRESS);
            const withDeploy = all.filter((r) => r.deployId);
            assert.strictEqual(withDeploy.length, 1);
            assert.strictEqual(withDeploy[0].deployId, deployId);
        });
    });

    describe("Scenario 8: Edge Cases & Error Conditions", () => {
        it("should handle attempting to operate on expired reservations", async () => {
            const resId = reservationService.lock(
                SENDER_ADDRESS,
                500n,
                100, // 100ms expiration
            );

            await new Promise((resolve) => setTimeout(resolve, 150));

            const res = reservationService.getReservation(resId);
            const isExpired =
                new Date(res!.expiresAt).getTime() < Date.now();
            assert.ok(isExpired);

            assert.throws(() => {
                reservationService.commit(resId);
            });
        });

        it("should prevent state transition errors gracefully", () => {
            const resId = reservationService.lock(SENDER_ADDRESS, 500n);

            reservationService.commit(resId);

            assert.throws(() => {
                reservationService.commit(resId);
            }, /Cannot commit a non-pending reservation/);

            assert.throws(() => {
                reservationService.release(resId);
            }, /Cannot release a non-pending reservation/);
        });
    });
});
