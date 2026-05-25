import ReservationRecord from "@/domain/aggregates/Reservation";
import { Address } from "@/domain/aggregates/Wallet";
import { ReservationStatus } from "@/domain/aggregates/Reservation/types";
import { Network, toAtomicAmount, Transaction } from "@domain/";
import { TxHistory } from "../TxHistory";
import { ReservationsFromTxsResolver } from "@domain/services/Reservation/ReservationsFromTxsResolver";

export interface ReservationError {
    code:
        | "INSUFFICIENT_BALANCE"
        | "RESERVATION_NOT_FOUND"
        | "INVALID_STATUS"
        | "INVALID_AMOUNT"
        | "RESERVATION_EXPIRED";
    message: string;
}

export default class FundsReservationService {
    private static instance: FundsReservationService;
    private reservations: Map<string, ReservationRecord> = new Map();
    private addressReservations: Map<Address, Set<string>> = new Map();

    public constructor(private txHistory: TxHistory) {}

    static getInstance(): FundsReservationService {
        if (!FundsReservationService.instance) {
            FundsReservationService.instance = new FundsReservationService(null as unknown as TxHistory);
        }
        return FundsReservationService.instance;
    }

    /**
     * Lock (reserve) funds for an address
     * @param address - Wallet address to reserve funds for
     * @param amount - Amount to reserve (in atomic units)
     * @param expirationTimeMs - Time in milliseconds before reservation expires (default: 5 minutes)
     * @param deployId - Optional deploy ID to associate with this reservation
     * @param reason - Optional description of why funds are reserved
     * @returns Reservation ID
     */
    lock(
        address: Address,
        amount: bigint,
        expirationTimeMs?: number,
        deployId?: string,
        reason?: string,
    ): string {
        if (amount <= 0n) {
            throw new Error("FundsReservationService.lock: Amount must be greater than zero");
        }

        const reservation = ReservationRecord.create(
            address,
            amount,
            expirationTimeMs,
            deployId,
            reason,
        );

        const reservationId = reservation.getId();
        this.reservations.set(reservationId, reservation);

        if (!this.addressReservations.has(address)) {
            this.addressReservations.set(address, new Set());
        }
        
        this.addressReservations.get(address)!.add(reservationId);

        return reservationId;
    }

    /**
     * Commit (finalize) a reservation, converting it from pending to committed
     * @param reservationId - ID of the reservation to commit
     * @param deployId - Optional deploy ID if not already set
     */
    commit(reservationId: string, deployId?: string): void {
        const reservation = this.reservations.get(reservationId);
        if (!reservation) {
            throw new Error(
                `FundsReservationService.commit: Reservation not found (ID: ${reservationId})`,
            );
        }

        try {
            reservation.commit(deployId);
        } catch (error: any) {
            throw new Error(`FundsReservationService.commit: ${error.message}`);
        }
    }

    /**
     * Release (unlock) a reservation, converting it from pending to released
     * @param reservationId - ID of the reservation to release
     */
    release(reservationId: string): void {
        const reservation = this.reservations.get(reservationId);
        if (!reservation) {
            throw new Error(
                `FundsReservationService.release: Reservation not found (ID: ${reservationId})`,
            );
        }

        try {
            reservation.release();
        } catch (error: any) {
            throw new Error(`FundsReservationService.release: ${error.message}`);
        }
    }

    /**
     * Finalize (complete) a committed reservation, marking it as released after blockchain confirmation
     * @param reservationId - ID of the reservation to finalize
     */
    finalize(reservationId: string): void {
        const reservation = this.reservations.get(reservationId);
        if (!reservation) {
            throw new Error(
                `FundsReservationService.finalize: Reservation not found (ID: ${reservationId})`,
            );
        }

        try {
            reservation.finalize();
        } catch (error: any) {
            throw new Error(`FundsReservationService.finalize: ${error.message}`);
        }
    }

    /**
     * Get total reserved amount for an address (pending + committed)
     * @param address - Wallet address
     * @returns Total reserved amount
     */
    getTotalReserved(address: Address): bigint {
        const addressReservationIds = this.addressReservations.get(address);
        if (!addressReservationIds || addressReservationIds.size === 0) {
            return 0n;
        }

        let total = 0n;
        for (const resId of addressReservationIds) {
            const reservation = this.reservations.get(resId)!;
            const status = reservation.getStatus();

            if (
                status === ReservationStatus.PENDING ||
                status === ReservationStatus.COMMITTED
            ) {
                if (!reservation.isExpired()) {
                    total += reservation.getAmount();
                }
            }
        }

        return total;
    }

    /**
     * Get reserved amount for an address (excluding expired)
     * @param address - Wallet address
     * @returns Reserved amount for pending reservations only
     */
    getPendingReserved(address: Address): bigint {
        const addressReservationIds = this.addressReservations.get(address);
        if (!addressReservationIds || addressReservationIds.size === 0) {
            return 0n;
        }

        let total = 0n;
        for (const resId of addressReservationIds) {
            const reservation = this.reservations.get(resId)!;

            if (
                reservation.isPending() &&
                !reservation.isExpired()
            ) {
                total += reservation.getAmount();
            }
        }

        return total;
    }

    /**
     * Get all reservations for an address
     * @param address - Wallet address
     * @returns Array of reservation objects
     */
    getReservations(address: Address) {
        const addressReservationIds = this.addressReservations.get(address);
        if (!addressReservationIds) {
            return [];
        }

        return Array.from(addressReservationIds)
            .map((id) => this.reservations.get(id)!)
            .map((res) => res.toObject());
    }

    /**
     * Get a specific reservation
     * @param reservationId - ID of the reservation
     * @returns Reservation object or undefined
     */
    getReservation(reservationId: string) {
        const reservation = this.reservations.get(reservationId);
        return reservation ? reservation.toObject() : undefined;
    }

    /**
     * Clean up expired reservations for an address
     * @param address - Wallet address
     * @returns Number of reservations removed
     */
    cleanupExpired(address: Address): number {
        const addressReservationIds = this.addressReservations.get(address);
        if (!addressReservationIds) {
            return 0;
        }

        let removed = 0;
        const toRemove: string[] = [];

        for (const resId of addressReservationIds) {
            const reservation = this.reservations.get(resId)!;
            if (reservation.isExpired() && reservation.isPending()) {
                toRemove.push(resId);
                removed++;
            }
        }

        for (const resId of toRemove) {
            this.reservations.delete(resId);
            addressReservationIds.delete(resId);
        }

        return removed;
    }

    /**
     * Clear all reservations (for testing/reset purposes)
     */
    clear(): void {
        this.reservations.clear();
        this.addressReservations.clear();
    }

    /**
     * Get all reservations (for debugging)
     * @returns Map of all reservations by ID
     */
    getAllReservations() {
        const result: Record<string, any> = {};
        for (const [id, reservation] of this.reservations) {
            result[id] = reservation.toObject();
        }
        return result;
    }

    /* reservations by transactions */
    /**
     * Application layer service. Orchestrates the retrieval of reservations from transactions.
     */
    public async getReservationsByTxs(network: Network, address: Address, auxVaultPassword: string) {
        const localTxs = await this.txHistory.getAddressOnNetworkLocalTxs(network, address, auxVaultPassword);
        return ReservationsFromTxsResolver.resolveFromTxs(localTxs);
    }
    /* /reservations by transactions */
}
