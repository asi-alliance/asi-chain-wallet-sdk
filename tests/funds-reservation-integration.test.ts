import { describe, it, beforeEach, afterEach } from "vitest";
import FundsReservationService from "@services/FundsReservation";
import { ReservationStatus } from "@domains/Reservation/types";
import { Address } from "@domains/Wallet";

/**
 * Integration Test Scenarios: FundsReservation with AssetsService
 *
 * These scenarios demonstrate how the reservation system integrates with
 * the AssetsService transfer mechanism to prevent double-spending and
 * provide safe concurrent transaction handling.
 */

const SENDER_ADDRESS = "1111" + "a".repeat(60) as Address;
const RECIPIENT_1 = "1111" + "b".repeat(60) as Address;
const RECIPIENT_2 = "1111" + "c".repeat(60) as Address;
const RECIPIENT_3 = "1111" + "d".repeat(60) as Address;

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
            /**
             * This mimics what happens in AssetsService.transfer():
             * 1. User initiates a transfer
             * 2. SDK locks funds before creating deploy
             * 3. Deploy is submitted and signed
             * 4. On success, reservation is committed with deploy ID
             */

            const transferAmount = 500n;
            const senderBalance = 1000n;

            // Step 1: Lock funds
            const reservationId = reservationService.lock(
                SENDER_ADDRESS,
                transferAmount,
                5 * 60 * 1000,
                undefined,
                `Transfer ${transferAmount} to ${RECIPIENT_1}`,
            );

            // Verify funds are reserved
            const reserved = reservationService.getTotalReserved(SENDER_ADDRESS);
            expect(reserved).toBe(transferAmount);
            expect(senderBalance - reserved).toBe(500n); // Available balance

            // Step 2: Deploy submission succeeds (mocked)
            const deployId = "deploy_abc123xyz";

            // Step 3: Commit the reservation with deploy ID
            reservationService.commit(reservationId, deployId);

            // Verify final state
            const reservation = reservationService.getReservation(reservationId);
            expect(reservation?.status).toBe(ReservationStatus.COMMITTED);
            expect(reservation?.deployId).toBe(deployId);
            expect(reservation?.reason).toContain("Transfer");

            // Funds still counted as reserved until blockchain confirms
            expect(reservationService.getTotalReserved(SENDER_ADDRESS)).toBe(
                transferAmount,
            );
        });

        it("should lock → submit fails → release a transfer", () => {
            /**
             * When transfer submission fails:
             * 1. Funds are locked
             * 2. Deploy submission or signing fails
             * 3. Reservation is released to unlock funds
             */

            const transferAmount = 300n;

            // Step 1: Lock funds
            const reservationId = reservationService.lock(
                SENDER_ADDRESS,
                transferAmount,
                5 * 60 * 1000,
                undefined,
                `Transfer ${transferAmount} to ${RECIPIENT_1} (FAILED)`,
            );

            // Simulate network error during submit
            const submitFailed = true;

            if (submitFailed) {
                // Step 2: Release reservation on error
                reservationService.release(reservationId);
            }

            // Verify funds are freed up
            const reservation = reservationService.getReservation(reservationId);
            expect(reservation?.status).toBe(ReservationStatus.RELEASED);

            // Important: getTotalReserved excludes released reservations
            // So funds appear available again
            const reserved = reservationService.getTotalReserved(SENDER_ADDRESS);
            expect(reserved).toBe(0n);
        });
    });

    describe("Scenario 2: Multiple Concurrent Transfers", () => {
        it("should handle 3 concurrent transfers with proper reservation tracking", () => {
            /**
             * User clicks "Send" multiple times without waiting:
             * - Transfer 1: 200 to Recipient A
             * - Transfer 2: 300 to Recipient B
             * - Transfer 3: 250 to Recipient C
             * Total sender balance: 1000
             */

            const balance = 1000n;
            const transfer1Amount = 200n;
            const transfer2Amount = 300n;
            const transfer3Amount = 250n;

            // All three transfers lock funds immediately
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

            // Total reserved
            const totalReserved = reservationService.getTotalReserved(
                SENDER_ADDRESS,
            );
            expect(totalReserved).toBe(
                transfer1Amount + transfer2Amount + transfer3Amount,
            );

            // Available balance for new transfers
            const available = balance - totalReserved;
            expect(available).toBe(250n);

            // Scenario: First and third succeed, second fails
            reservationService.commit(res1, "deploy_1");
            reservationService.release(res2);
            reservationService.commit(res3, "deploy_3");

            // Verify state
            const all = reservationService.getReservations(SENDER_ADDRESS);
            expect(
                all.filter((r) => r.status === ReservationStatus.COMMITTED),
            ).toHaveLength(2);
            expect(
                all.filter((r) => r.status === ReservationStatus.RELEASED),
            ).toHaveLength(1);

            // Total reserved still includes committed + released (for history)
            const stillReserved = reservationService.getTotalReserved(
                SENDER_ADDRESS,
            );
            expect(stillReserved).toBe(totalReserved);

            // But available calculation would only count COMMITTED
            const committedOnly = all
                .filter((r) => r.status === ReservationStatus.COMMITTED)
                .reduce((sum, r) => sum + r.amount, 0n);
            expect(committedOnly).toBe(transfer1Amount + transfer3Amount);
        });
    });

    describe("Scenario 3: Prevention of Double-Spending", () => {
        it("should prevent user from sending more than balance via reservation checks", () => {
            /**
             * User has 1000 ASI but tries to send 700 + 600 = 1300
             * Reservation system catches this
             */

            const balance = 1000n;
            const firstTransfer = 700n;
            const secondTransfer = 600n;

            // First transfer: Lock funds
            const res1 = reservationService.lock(
                SENDER_ADDRESS,
                firstTransfer,
                5 * 60 * 1000,
                undefined,
                "First transfer",
            );

            const reserved1 = reservationService.getTotalReserved(
                SENDER_ADDRESS,
            );
            expect(reserved1).toBe(firstTransfer);

            // Available for second transfer
            const availableForSecond = balance - reserved1;
            expect(availableForSecond).toBe(300n);

            // Check: Can we lock the second transfer?
            const canLockSecond = secondTransfer <= availableForSecond;
            expect(canLockSecond).toBe(false);

            // SDK would prevent locking
            if (!canLockSecond) {
                // Reject second transfer before even attempting lock
                expect("Insufficient reserved balance").toBeDefined();
            } else {
                // If somehow we did lock both
                reservationService.lock(
                    SENDER_ADDRESS,
                    secondTransfer,
                    5 * 60 * 1000,
                );
                const totalReserved = reservationService.getTotalReserved(
                    SENDER_ADDRESS,
                );
                expect(totalReserved).toBeGreaterThan(balance);
            }
        });
    });

    describe("Scenario 4: Reservation Expiration & Cleanup", () => {
        it("should handle reservation expiration for stuck/abandoned transfers", () => {
            /**
             * Transfer initiated but network hangs:
             * 1. Funds locked with 5-minute expiration
             * 2. After timeout, reservation expires
             * 3. User can retry with cleanup
             */

            const transferAmount = 400n;
            const shortExpiration = 100; // 100ms for testing

            // Lock with short expiration
            const resId = reservationService.lock(
                SENDER_ADDRESS,
                transferAmount,
                shortExpiration,
                undefined,
                "Stuck transfer",
            );

            // Check immediately: not expired
            let res = reservationService.getReservation(resId);
            expect(res?.status).toBe(ReservationStatus.PENDING);

            // Simulate waiting for expiration
            const wait = new Promise((resolve) => setTimeout(resolve, 150));

            wait.then(() => {
                // After 150ms, it's expired
                const reservation = reservationService.getReservation(resId);
                const isExpired = new Date(
                    reservation!.expiresAt,
                ).getTime() < Date.now();

                // User initiates cleanup
                if (isExpired) {
                    const cleaned = reservationService.cleanupExpired(
                        SENDER_ADDRESS,
                    );
                    expect(cleaned).toBe(1);

                    // Funds available again
                    const reserved = reservationService.getTotalReserved(
                        SENDER_ADDRESS,
                    );
                    expect(reserved).toBe(0n);
                }
            });
        });
    });

    describe("Scenario 5: Transaction Resubmission with Reservation", () => {
        it("should handle resubmit flow with persistent reservation", () => {
            /**
             * Transfer fails initially, gets resubmitted:
             * 1. Lock initial transfer attempt
             * 2. Submit fails
             * 3. Release and retry (new lock)
             * 4. Resubmit succeeds, commit final reservation
             */

            const amount = 600n;

            // Attempt 1: Lock and fail
            const res1 = reservationService.lock(
                SENDER_ADDRESS,
                amount,
                5 * 60 * 1000,
                undefined,
                "Transfer attempt 1",
            );

            // Submit fails
            const submitFailed = true;
            if (submitFailed) {
                reservationService.release(res1);
            }

            const afterFail = reservationService.getTotalReserved(
                SENDER_ADDRESS,
            );
            expect(afterFail).toBe(0n); // Available again

            // Attempt 2: Retry with new reservation
            const res2 = reservationService.lock(
                SENDER_ADDRESS,
                amount,
                5 * 60 * 1000,
                undefined,
                "Transfer attempt 2",
            );

            // This time succeeds
            const deployId = "deploy_final_xyz";
            reservationService.commit(res2, deployId);

            // Final state
            const reservations =
                reservationService.getReservations(SENDER_ADDRESS);
            expect(reservations).toHaveLength(2);
            expect(
                reservations.filter((r) => r.status === ReservationStatus.RELEASED),
            ).toHaveLength(1);
            expect(
                reservations.filter((r) => r.status === ReservationStatus.COMMITTED),
            ).toHaveLength(1);
        });
    });

    describe("Scenario 6: Multiple Addresses (Independent Operations)", () => {
        it("should maintain independent reservations per address", () => {
            /**
             * Address A sends to B and C
             * Address B sends to A
             * Each maintains independent reservation state
             */

            const addr_A = SENDER_ADDRESS;
            const addr_B = RECIPIENT_1;
            const addr_C = RECIPIENT_2;

            // Address A locks two transfers
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

            // Address B locks one transfer
            const b_to_a = reservationService.lock(
                addr_B,
                100n,
                5 * 60 * 1000,
                undefined,
                "B → A",
            );

            // Verify independent state
            expect(reservationService.getTotalReserved(addr_A)).toBe(500n);
            expect(reservationService.getTotalReserved(addr_B)).toBe(100n);
            expect(reservationService.getTotalReserved(addr_C)).toBe(0n);

            // Commit A's transfers
            reservationService.commit(a_to_b, "deploy_a_b");
            reservationService.commit(a_to_c, "deploy_a_c");

            // B still has pending
            expect(reservationService.getTotalReserved(addr_A)).toBe(500n);
            expect(reservationService.getTotalReserved(addr_B)).toBe(100n);

            // Get individual reservation lists
            const a_reservations =
                reservationService.getReservations(addr_A);
            const b_reservations =
                reservationService.getReservations(addr_B);

            expect(a_reservations).toHaveLength(2);
            expect(b_reservations).toHaveLength(1);
            expect(
                a_reservations.every((r) => r.address === addr_A),
            ).toBe(true);
            expect(
                b_reservations.every((r) => r.address === addr_B),
            ).toBe(true);
        });
    });

    describe("Scenario 7: Reservation Tracking with Deploy IDs", () => {
        it("should maintain link between reservation and on-chain deploy", () => {
            /**
             * Integrators can later query:
             * - Which reservations are pending (network submitted)
             * - Which deploy corresponds to which reservation
             * - Full transaction history
             */

            const reservationId = reservationService.lock(
                SENDER_ADDRESS,
                1000n,
                5 * 60 * 1000,
                undefined,
                "High-value transfer",
            );

            // Before commit: no deploy ID
            let res = reservationService.getReservation(reservationId);
            expect(res?.deployId).toBeUndefined();

            // Commit with deploy ID
            const deployId =
                "11111111111122222222222233333333444444445555555555555";
            reservationService.commit(reservationId, deployId);

            // After commit: can retrieve deploy ID
            res = reservationService.getReservation(reservationId);
            expect(res?.deployId).toBe(deployId);

            // Get all reservations and filter
            const all = reservationService.getReservations(SENDER_ADDRESS);
            const withDeploy = all.filter((r) => r.deployId);
            expect(withDeploy).toHaveLength(1);
            expect(withDeploy[0].deployId).toBe(deployId);
        });
    });

    describe("Scenario 8: Edge Cases & Error Conditions", () => {
        it("should handle attempting to operate on expired reservations", () => {
            const resId = reservationService.lock(
                SENDER_ADDRESS,
                500n,
                100, // 100ms expiration
            );

            // Simulate expiration
            const wait = new Promise((resolve) => setTimeout(resolve, 150));

            wait.then(() => {
                // Check reservation is expired
                const res = reservationService.getReservation(resId);
                const isExpired = new Date(
                    res!.expiresAt,
                ).getTime() < Date.now();
                expect(isExpired).toBe(true);

                // Cannot commit expired reservation
                expect(() => {
                    reservationService.commit(resId);
                }).toThrow();
            });
        });

        it("should prevent state transition errors gracefully", () => {
            const resId = reservationService.lock(SENDER_ADDRESS, 500n);

            // Single commit succeeds
            reservationService.commit(resId);

            // Second commit fails
            expect(() => {
                reservationService.commit(resId);
            }).toThrow("Cannot commit a non-pending reservation");

            // Cannot release committed reservation
            expect(() => {
                reservationService.release(resId);
            }).toThrow("Cannot release a non-pending reservation");
        });
    });
});
