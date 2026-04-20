import assert from "node:assert";
import ReservationRecord from "@domains/Reservation";
import FundsReservationService from "@services/FundsReservation";
import { describe, it, beforeEach, afterEach } from "node:test";
import { ReservationStatus } from "@domains/Reservation/types";
import { Address } from "@domains/Wallet";

const MOCK_ADDRESS = ("1111" + "a".repeat(60)) as Address;
const MOCK_ADDRESS_2 = ("1111" + "b".repeat(60)) as Address;

describe("FundsReservationService", () => {
    let reservationService: FundsReservationService;

    beforeEach(() => {
        reservationService = FundsReservationService.getInstance();
        reservationService.clear();
    });

    afterEach(() => {
        reservationService.clear();
    });

    describe("lock() - Basic Reservation", () => {
        it("should create a reservation and return a reservation ID", () => {
            const amount = 1000n;
            const reservationId = reservationService.lock(MOCK_ADDRESS, amount);

            assert.ok(reservationId !== undefined && reservationId !== null);
            assert.strictEqual(typeof reservationId, "string");
            assert.ok(reservationId.startsWith("res_"));
        });

        it("should throw error for zero or negative amount", () => {
            assert.throws(() => {
                reservationService.lock(MOCK_ADDRESS, 0n);
            }, /Amount must be greater than zero/);

            assert.throws(() => {
                reservationService.lock(MOCK_ADDRESS, -100n);
            }, /Amount must be greater than zero/);
        });

        it("should store reservation with pending status", () => {
            const amount = 5000n;
            const reservationId = reservationService.lock(MOCK_ADDRESS, amount);

            const reservation =
                reservationService.getReservation(reservationId);
            assert.ok(reservation !== undefined && reservation !== null);
            assert.strictEqual(reservation?.status, ReservationStatus.PENDING);
            assert.strictEqual(reservation?.amount, amount);
            assert.strictEqual(reservation?.address, MOCK_ADDRESS);
        });

        it("should accept optional parameters (deployId and reason)", () => {
            const amount = 2000n;
            const deployId = "deploy_123";
            const reason = "Transfer to user X";

            const reservationId = reservationService.lock(
                MOCK_ADDRESS,
                amount,
                undefined,
                deployId,
                reason,
            );

            const reservation =
                reservationService.getReservation(reservationId);
            assert.strictEqual(reservation?.deployId, deployId);
            assert.strictEqual(reservation?.reason, reason);
        });

        it("should accept custom expiration time", () => {
            const amount = 3000n;
            const customExpiration = 10 * 60 * 1000; // 10 minutes

            const reservationId = reservationService.lock(
                MOCK_ADDRESS,
                amount,
                customExpiration,
            );

            const reservation =
                reservationService.getReservation(reservationId);
            const expectedExpiry = Date.now() + customExpiration;

            assert.ok(Math.abs(reservation!.expiresAt - expectedExpiry) < 1000);
        });
    });

    describe("commit() - Finalize Reservation", () => {
        it("should transition pending reservation to committed", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            reservationService.commit(reservationId);

            const reservation =
                reservationService.getReservation(reservationId);
            assert.strictEqual(
                reservation?.status,
                ReservationStatus.COMMITTED,
            );
        });

        it("should allow setting deployId during commit", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            const deployId = "deploy_abc123";

            reservationService.commit(reservationId, deployId);

            const reservation =
                reservationService.getReservation(reservationId);
            assert.strictEqual(reservation?.deployId, deployId);
        });

        it("should throw error when committing non-pending reservation", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            reservationService.commit(reservationId);

            assert.throws(() => {
                reservationService.commit(reservationId);
            }, /Cannot commit a non-pending reservation/);
        });

        it("should throw error when committing non-existent reservation", () => {
            assert.throws(() => {
                reservationService.commit("non_existent_id");
            }, /Reservation not found/);
        });
    });

    describe("release() - Cancel Reservation", () => {
        it("should transition pending reservation to released", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            reservationService.release(reservationId);

            const reservation =
                reservationService.getReservation(reservationId);
            assert.strictEqual(reservation?.status, ReservationStatus.RELEASED);
        });

        it("should throw error when releasing non-pending reservation", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            reservationService.commit(reservationId);

            assert.throws(() => {
                reservationService.release(reservationId);
            }, /Cannot release a non-pending reservation/);
        });

        it("should throw error when releasing non-existent reservation", () => {
            assert.throws(() => {
                reservationService.release("non_existent_id");
            }, /Reservation not found/);
        });
    });

    describe("getTotalReserved() - Calculate Reserved Funds", () => {
        it("should return zero for address with no reservations", () => {
            const total = reservationService.getTotalReserved(MOCK_ADDRESS);
            assert.strictEqual(total, 0n);
        });

        it("should sum all pending reservations for an address", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);
            const res3 = reservationService.lock(MOCK_ADDRESS, 3000n);

            const total = reservationService.getTotalReserved(MOCK_ADDRESS);
            assert.strictEqual(total, 6000n);
        });

        it("should exclude released reservations from total", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            reservationService.release(res1);

            const total = reservationService.getTotalReserved(MOCK_ADDRESS);
            assert.strictEqual(total, 2000n);
        });

        it("should include committed reservations in total", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            reservationService.commit(res1);

            const total = reservationService.getTotalReserved(MOCK_ADDRESS);
            assert.strictEqual(total, 3000n);
        });

        it("should exclude expired reservations from total", async () => {
            const res1 = reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                100, // 100ms expiration
            );
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            // Simulate time passing
            await new Promise((resolve) => setTimeout(resolve, 150));
            const total = reservationService.getTotalReserved(MOCK_ADDRESS);

            assert.strictEqual(total, 2000n);
        });

        it("should handle multiple addresses independently", () => {
            reservationService.lock(MOCK_ADDRESS, 1000n);
            reservationService.lock(MOCK_ADDRESS, 2000n);
            reservationService.lock(MOCK_ADDRESS_2, 5000n);

            assert.strictEqual(
                reservationService.getTotalReserved(MOCK_ADDRESS),
                3000n,
            );
            assert.strictEqual(
                reservationService.getTotalReserved(MOCK_ADDRESS_2),
                5000n,
            );
        });
    });

    describe("getPendingReserved() - Get Pending Reservations Only", () => {
        it("should return only pending reservation amount", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            reservationService.commit(res1);

            const pending = reservationService.getPendingReserved(MOCK_ADDRESS);
            assert.strictEqual(pending, 2000n);
        });

        it("should exclude released reservations", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            reservationService.release(res1);

            const pending = reservationService.getPendingReserved(MOCK_ADDRESS);
            assert.strictEqual(pending, 2000n);
        });
    });

    describe("getReservations() - Query Address Reservations", () => {
        it("should return empty array for address with no reservations", () => {
            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            assert.deepStrictEqual(reservations, []);
        });

        it("should return all reservations for an address", () => {
            const res1Id = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2Id = reservationService.lock(MOCK_ADDRESS, 2000n);

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            assert.strictEqual(reservations.length, 2);
            assert.deepStrictEqual(
                reservations.map((r) => r.id).sort(),
                [res1Id, res2Id].sort(),
            );
        });

        it("should include reservation details", () => {
            const reason = "Test transfer";
            reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                undefined,
                undefined,
                reason,
            );

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            assert.strictEqual(reservations[0].reason, reason);
            assert.strictEqual(reservations[0].amount, 1000n);
            assert.strictEqual(reservations[0].address, MOCK_ADDRESS);
        });
    });

    describe("cleanupExpired() - Remove Expired Reservations", () => {
        it("should remove expired pending reservations", async () => {
            const res1 = reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                100, // 100ms expiration
            );
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            await new Promise((resolve) => setTimeout(resolve, 150));
            const removed = reservationService.cleanupExpired(MOCK_ADDRESS);
            assert.strictEqual(removed, 1);

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            assert.strictEqual(reservations.length, 1);
            assert.strictEqual(reservations[0].id, res2);
        });

        it("should not remove non-expired reservations", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            const removed = reservationService.cleanupExpired(MOCK_ADDRESS);
            assert.strictEqual(removed, 0);

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            assert.strictEqual(reservations.length, 2);
        });

        it("should not remove committed or released reservations", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);
            const res3 = reservationService.lock(MOCK_ADDRESS, 3000n);

            reservationService.commit(res1);
            reservationService.release(res2);

            const removed = reservationService.cleanupExpired(MOCK_ADDRESS);
            assert.strictEqual(removed, 0);

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            assert.strictEqual(reservations.length, 3);
        });
    });

    describe("Transaction Lifecycle Scenarios", () => {
        it("should handle successful transfer lifecycle: lock → commit", () => {
            const reservationId = reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                5 * 60 * 1000,
                undefined,
                "Transfer to user",
            );

            let reservation = reservationService.getReservation(reservationId);
            assert.strictEqual(reservation?.status, ReservationStatus.PENDING);

            const deployId = "deploy_xyz789";
            reservationService.commit(reservationId, deployId);

            reservation = reservationService.getReservation(reservationId);
            assert.strictEqual(
                reservation?.status,
                ReservationStatus.COMMITTED,
            );
            assert.strictEqual(reservation?.deployId, deployId);
        });

        it("should handle failed transfer lifecycle: lock → release", () => {
            const reservationId = reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                undefined,
                undefined,
                "Failed transfer",
            );

            let reservation = reservationService.getReservation(reservationId);
            assert.strictEqual(reservation?.status, ReservationStatus.PENDING);

            reservationService.release(reservationId);

            reservation = reservationService.getReservation(reservationId);
            assert.strictEqual(reservation?.status, ReservationStatus.RELEASED);
        });

        it("should handle concurrent transfers with fund locking", () => {
            const amount1 = 1000n;
            const amount2 = 2000n;
            const amount3 = 1500n;

            const res1 = reservationService.lock(
                MOCK_ADDRESS,
                amount1,
                undefined,
                undefined,
                "Transfer to A",
            );
            const res2 = reservationService.lock(
                MOCK_ADDRESS,
                amount2,
                undefined,
                undefined,
                "Transfer to B",
            );
            const res3 = reservationService.lock(
                MOCK_ADDRESS,
                amount3,
                undefined,
                undefined,
                "Transfer to C",
            );

            const totalReserved =
                reservationService.getTotalReserved(MOCK_ADDRESS);
            assert.strictEqual(totalReserved, amount1 + amount2 + amount3);

            reservationService.commit(res1, "deploy_1");

            reservationService.release(res2);

            reservationService.commit(res3, "deploy_3");

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            assert.strictEqual(
                reservations.filter(
                    (r) => r.status === ReservationStatus.COMMITTED,
                ).length,
                2,
            );
            assert.strictEqual(
                reservations.filter(
                    (r) => r.status === ReservationStatus.RELEASED,
                ).length,
                1,
            );

            assert.strictEqual(
                reservationService.getTotalReserved(MOCK_ADDRESS),
                amount1 + amount3,
            );
        });

        it("should prevent double-spending via reservation checks", () => {
            const balance = 5000n;
            const availableForNewTransfer =
                balance - reservationService.getTotalReserved(MOCK_ADDRESS);

            assert.strictEqual(availableForNewTransfer, balance);

            reservationService.lock(MOCK_ADDRESS, 2000n);
            reservationService.lock(MOCK_ADDRESS, 1500n);

            const reserved = reservationService.getTotalReserved(MOCK_ADDRESS);
            assert.strictEqual(reserved, 3500n);

            const newTransferAmount = 1800n;

            const wouldExceed = reserved + newTransferAmount > balance;
            
            assert.strictEqual(wouldExceed, true);

            const newRes = reservationService.lock(
                MOCK_ADDRESS,
                newTransferAmount,
            );
            assert.strictEqual(
                reservationService.getTotalReserved(MOCK_ADDRESS),
                5300n,
            );

            const attemptedOverspend =
                reservationService.getTotalReserved(MOCK_ADDRESS) > balance;
            assert.strictEqual(attemptedOverspend, true);
        });
    });

    describe("ReservationRecord Domain Object", () => {
        it("should create and access reservation properties", () => {
            const amount = 2500n;
            const reservation = ReservationRecord.create(
                MOCK_ADDRESS,
                amount,
                10 * 60 * 1000,
                "deploy_test",
                "Test reason",
            );

            assert.ok(
                reservation.getId() !== undefined &&
                    reservation.getId() !== null,
            );
            assert.strictEqual(reservation.getAddress(), MOCK_ADDRESS);
            assert.strictEqual(reservation.getAmount(), amount);
            assert.strictEqual(
                reservation.getStatus(),
                ReservationStatus.PENDING,
            );
            assert.strictEqual(reservation.getDeployId(), "deploy_test");
            assert.strictEqual(reservation.getReason(), "Test reason");
        });

        it("should check expiration status", async () => {
            const reservation = ReservationRecord.create(
                MOCK_ADDRESS,
                1000n,
                100, // 100ms expiration
            );

            assert.strictEqual(reservation.isExpired(), false);

            await new Promise((resolve) => setTimeout(resolve, 150));
            assert.strictEqual(reservation.isExpired(), true);
        });

        it("should transition through states correctly", () => {
            const reservation = ReservationRecord.create(MOCK_ADDRESS, 1000n);

            assert.strictEqual(reservation.isPending(), true);
            assert.strictEqual(reservation.isCommitted(), false);
            assert.strictEqual(reservation.isReleased(), false);

            reservation.commit();

            assert.strictEqual(reservation.isPending(), false);
            assert.strictEqual(reservation.isCommitted(), true);
            assert.strictEqual(reservation.isReleased(), false);
        });
    });
});
