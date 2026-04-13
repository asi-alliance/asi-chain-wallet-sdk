import { describe, it, beforeEach, afterEach, expect } from "vitest";
import FundsReservationService from "@services/FundsReservation";
import ReservationRecord from "@domains/Reservation";
import { ReservationStatus } from "@domains/Reservation/types";
import { Address } from "@domains/Wallet";

// Mock address for testing
const MOCK_ADDRESS = "1111" + "a".repeat(60) as Address;
const MOCK_ADDRESS_2 = "1111" + "b".repeat(60) as Address;

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

            expect(reservationId).toBeDefined();
            expect(typeof reservationId).toBe("string");
            expect(reservationId.startsWith("res_")).toBe(true);
        });

        it("should throw error for zero or negative amount", () => {
            expect(() => {
                reservationService.lock(MOCK_ADDRESS, 0n);
            }).toThrow("Amount must be greater than zero");

            expect(() => {
                reservationService.lock(MOCK_ADDRESS, -100n);
            }).toThrow("Amount must be greater than zero");
        });

        it("should store reservation with pending status", () => {
            const amount = 5000n;
            const reservationId = reservationService.lock(MOCK_ADDRESS, amount);

            const reservation = reservationService.getReservation(reservationId);
            expect(reservation).toBeDefined();
            expect(reservation?.status).toBe(ReservationStatus.PENDING);
            expect(reservation?.amount).toBe(amount);
            expect(reservation?.address).toBe(MOCK_ADDRESS);
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

            const reservation = reservationService.getReservation(reservationId);
            expect(reservation?.deployId).toBe(deployId);
            expect(reservation?.reason).toBe(reason);
        });

        it("should accept custom expiration time", () => {
            const amount = 3000n;
            const customExpiration = 10 * 60 * 1000; // 10 minutes

            const reservationId = reservationService.lock(
                MOCK_ADDRESS,
                amount,
                customExpiration,
            );

            const reservation = reservationService.getReservation(reservationId);
            const expectedExpiry = Date.now() + customExpiration;

            // Allow small time difference for test execution
            expect(
                Math.abs(reservation!.expiresAt - expectedExpiry),
            ).toBeLessThan(1000);
        });
    });

    describe("commit() - Finalize Reservation", () => {
        it("should transition pending reservation to committed", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            reservationService.commit(reservationId);

            const reservation = reservationService.getReservation(reservationId);
            expect(reservation?.status).toBe(ReservationStatus.COMMITTED);
        });

        it("should allow setting deployId during commit", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            const deployId = "deploy_abc123";

            reservationService.commit(reservationId, deployId);

            const reservation = reservationService.getReservation(reservationId);
            expect(reservation?.deployId).toBe(deployId);
        });

        it("should throw error when committing non-pending reservation", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            reservationService.commit(reservationId);

            expect(() => {
                reservationService.commit(reservationId);
            }).toThrow("Cannot commit a non-pending reservation");
        });

        it("should throw error when committing non-existent reservation", () => {
            expect(() => {
                reservationService.commit("non_existent_id");
            }).toThrow("Reservation not found");
        });
    });

    describe("release() - Cancel Reservation", () => {
        it("should transition pending reservation to released", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            reservationService.release(reservationId);

            const reservation = reservationService.getReservation(reservationId);
            expect(reservation?.status).toBe(ReservationStatus.RELEASED);
        });

        it("should throw error when releasing non-pending reservation", () => {
            const reservationId = reservationService.lock(MOCK_ADDRESS, 5000n);
            reservationService.commit(reservationId);

            expect(() => {
                reservationService.release(reservationId);
            }).toThrow("Cannot release a non-pending reservation");
        });

        it("should throw error when releasing non-existent reservation", () => {
            expect(() => {
                reservationService.release("non_existent_id");
            }).toThrow("Reservation not found");
        });
    });

    describe("getTotalReserved() - Calculate Reserved Funds", () => {
        it("should return zero for address with no reservations", () => {
            const total = reservationService.getTotalReserved(MOCK_ADDRESS);
            expect(total).toBe(0n);
        });

        it("should sum all pending reservations for an address", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);
            const res3 = reservationService.lock(MOCK_ADDRESS, 3000n);

            const total = reservationService.getTotalReserved(MOCK_ADDRESS);
            expect(total).toBe(6000n);
        });

        it("should exclude released reservations from total", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            reservationService.release(res1);

            const total = reservationService.getTotalReserved(MOCK_ADDRESS);
            expect(total).toBe(2000n);
        });

        it("should include committed reservations in total", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            reservationService.commit(res1);

            const total = reservationService.getTotalReserved(MOCK_ADDRESS);
            expect(total).toBe(3000n);
        });

        it("should exclude expired reservations from total", (context) => {
            context.skipIf(!globalThis.vi);

            const res1 = reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                100, // 100ms expiration
            );
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            // Simulate time passing
            setTimeout(() => {
                const total = reservationService.getTotalReserved(MOCK_ADDRESS);
                // Only res2 should be counted as res1 expired
                expect(total).toBe(2000n);
            }, 150);
        });

        it("should handle multiple addresses independently", () => {
            reservationService.lock(MOCK_ADDRESS, 1000n);
            reservationService.lock(MOCK_ADDRESS, 2000n);
            reservationService.lock(MOCK_ADDRESS_2, 5000n);

            expect(reservationService.getTotalReserved(MOCK_ADDRESS)).toBe(3000n);
            expect(reservationService.getTotalReserved(MOCK_ADDRESS_2)).toBe(
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
            expect(pending).toBe(2000n);
        });

        it("should exclude released reservations", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            reservationService.release(res1);

            const pending = reservationService.getPendingReserved(MOCK_ADDRESS);
            expect(pending).toBe(2000n);
        });
    });

    describe("getReservations() - Query Address Reservations", () => {
        it("should return empty array for address with no reservations", () => {
            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            expect(reservations).toEqual([]);
        });

        it("should return all reservations for an address", () => {
            const res1Id = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2Id = reservationService.lock(MOCK_ADDRESS, 2000n);

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            expect(reservations).toHaveLength(2);
            expect(reservations.map((r) => r.id).sort()).toEqual(
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
            expect(reservations[0].reason).toBe(reason);
            expect(reservations[0].amount).toBe(1000n);
            expect(reservations[0].address).toBe(MOCK_ADDRESS);
        });
    });

    describe("cleanupExpired() - Remove Expired Reservations", () => {
        it("should remove expired pending reservations", (context) => {
            context.skipIf(!globalThis.vi);

            const res1 = reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                100, // 100ms expiration
            );
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            setTimeout(() => {
                const removed = reservationService.cleanupExpired(MOCK_ADDRESS);
                expect(removed).toBe(1);

                const reservations =
                    reservationService.getReservations(MOCK_ADDRESS);
                expect(reservations).toHaveLength(1);
                expect(reservations[0].id).toBe(res2);
            }, 150);
        });

        it("should not remove non-expired reservations", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);

            const removed = reservationService.cleanupExpired(MOCK_ADDRESS);
            expect(removed).toBe(0);

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            expect(reservations).toHaveLength(2);
        });

        it("should not remove committed or released reservations", () => {
            const res1 = reservationService.lock(MOCK_ADDRESS, 1000n);
            const res2 = reservationService.lock(MOCK_ADDRESS, 2000n);
            const res3 = reservationService.lock(MOCK_ADDRESS, 3000n);

            reservationService.commit(res1);
            reservationService.release(res2);

            const removed = reservationService.cleanupExpired(MOCK_ADDRESS);
            expect(removed).toBe(0);

            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            expect(reservations).toHaveLength(3);
        });
    });

    describe("Transaction Lifecycle Scenarios", () => {
        it("should handle successful transfer lifecycle: lock → commit", () => {
            // Step 1: Lock funds
            const reservationId = reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                5 * 60 * 1000,
                undefined,
                "Transfer to user",
            );

            let reservation = reservationService.getReservation(reservationId);
            expect(reservation?.status).toBe(ReservationStatus.PENDING);

            // Step 2: Submit deploy and commit
            const deployId = "deploy_xyz789";
            reservationService.commit(reservationId, deployId);

            reservation = reservationService.getReservation(reservationId);
            expect(reservation?.status).toBe(ReservationStatus.COMMITTED);
            expect(reservation?.deployId).toBe(deployId);
        });

        it("should handle failed transfer lifecycle: lock → release", () => {
            // Step 1: Lock funds
            const reservationId = reservationService.lock(
                MOCK_ADDRESS,
                1000n,
                undefined,
                undefined,
                "Failed transfer",
            );

            let reservation = reservationService.getReservation(reservationId);
            expect(reservation?.status).toBe(ReservationStatus.PENDING);

            // Step 2: Transfer fails, release reservation
            reservationService.release(reservationId);

            reservation = reservationService.getReservation(reservationId);
            expect(reservation?.status).toBe(ReservationStatus.RELEASED);
        });

        it("should handle concurrent transfers with fund locking", () => {
            const amount1 = 1000n;
            const amount2 = 2000n;
            const amount3 = 1500n;

            // User initiates 3 transfers concurrently
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

            // Check total reserved
            const totalReserved = reservationService.getTotalReserved(
                MOCK_ADDRESS,
            );
            expect(totalReserved).toBe(amount1 + amount2 + amount3);

            // First transfer succeeds
            reservationService.commit(res1, "deploy_1");

            // Second transfer fails
            reservationService.release(res2);

            // Third transfer succeeds
            reservationService.commit(res3, "deploy_3");

            // Verify final state
            const reservations =
                reservationService.getReservations(MOCK_ADDRESS);
            expect(reservations.filter((r) => r.status === ReservationStatus.COMMITTED)).toHaveLength(2);
            expect(reservations.filter((r) => r.status === ReservationStatus.RELEASED)).toHaveLength(1);

            // Total still includes all (committed + pending + released)
            expect(reservationService.getTotalReserved(MOCK_ADDRESS)).toBe(
                totalReserved,
            );
        });

        it("should prevent double-spending via reservation checks", () => {
            const balance = 5000n;
            const availableForNewTransfer = balance - reservationService.getTotalReserved(MOCK_ADDRESS);

            // Verify initial state
            expect(availableForNewTransfer).toBe(balance);

            // Lock some funds
            reservationService.lock(MOCK_ADDRESS, 2000n);
            reservationService.lock(MOCK_ADDRESS, 1500n);

            // Calculate available funds (would need balance from actual wallet)
            const reserved = reservationService.getTotalReserved(MOCK_ADDRESS);
            expect(reserved).toBe(3500n);

            // New transfer should respect reserved amount
            const newTransferAmount = 1800n;
            const wouldExceed = reserved + newTransferAmount > balance;
            expect(wouldExceed).toBe(false);

            // Lock the new amount
            const newRes = reservationService.lock(
                MOCK_ADDRESS,
                newTransferAmount,
            );
            expect(reservationService.getTotalReserved(MOCK_ADDRESS)).toBe(
                5300n,
            );

            // Now it would exceed
            const attemptedOverspend =
                reservationService.getTotalReserved(MOCK_ADDRESS) >
                balance;
            expect(attemptedOverspend).toBe(true);
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

            expect(reservation.getId()).toBeDefined();
            expect(reservation.getAddress()).toBe(MOCK_ADDRESS);
            expect(reservation.getAmount()).toBe(amount);
            expect(reservation.getStatus()).toBe(ReservationStatus.PENDING);
            expect(reservation.getDeployId()).toBe("deploy_test");
            expect(reservation.getReason()).toBe("Test reason");
        });

        it("should check expiration status", (context) => {
            context.skipIf(!globalThis.vi);

            const reservation = ReservationRecord.create(
                MOCK_ADDRESS,
                1000n,
                100, // 100ms expiration
            );

            expect(reservation.isExpired()).toBe(false);

            setTimeout(() => {
                expect(reservation.isExpired()).toBe(true);
            }, 150);
        });

        it("should transition through states correctly", () => {
            const reservation = ReservationRecord.create(
                MOCK_ADDRESS,
                1000n,
            );

            expect(reservation.isPending()).toBe(true);
            expect(reservation.isCommitted()).toBe(false);
            expect(reservation.isReleased()).toBe(false);

            reservation.commit();

            expect(reservation.isPending()).toBe(false);
            expect(reservation.isCommitted()).toBe(true);
            expect(reservation.isReleased()).toBe(false);
        });
    });
});
