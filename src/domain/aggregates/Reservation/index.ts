import { Address } from "../Wallet";
import { Reservation, ReservationStatus } from "./types";
import { generateRandomId } from "@/infrastructure/misc";
export {type Reservation} from "./types";

export default class ReservationRecord {
    private reservation: Reservation;

    private constructor(reservation: Reservation) {
        this.reservation = reservation;
    }

    static create(
        address: Address,
        amount: bigint,
        expirationTimeMs: number = 5 * 60 * 1000, // 5 minutes default
        deployId?: string,
        reason?: string,
    ): ReservationRecord {
        const now = Date.now();

        const reservation: Reservation = {
            id: generateRandomId(),
            address,
            amount,
            status: ReservationStatus.PENDING,
            createdAt: now,
            expiresAt: now + expirationTimeMs,
            deployId,
            reason,
        };

        return new ReservationRecord(reservation);
    }

    getId(): string {
        return this.reservation.id;
    }

    getAddress(): Address {
        return this.reservation.address;
    }

    getAmount(): bigint {
        return this.reservation.amount;
    }

    getStatus(): ReservationStatus {
        return this.reservation.status;
    }

    getDeployId(): string | undefined {
        return this.reservation.deployId;
    }

    getReason(): string | undefined {
        return this.reservation.reason;
    }

    getCreatedAt(): number {
        return this.reservation.createdAt;
    }

    getExpiresAt(): number {
        return this.reservation.expiresAt;
    }

    isExpired(): boolean {
        return Date.now() > this.reservation.expiresAt;
    }

    isPending(): boolean {
        return this.reservation.status === ReservationStatus.PENDING;
    }

    isCommitted(): boolean {
        return this.reservation.status === ReservationStatus.COMMITTED;
    }

    isReleased(): boolean {
        return this.reservation.status === ReservationStatus.RELEASED;
    }

    commit(deployId?: string): void {
        if (!this.isPending()) {
            throw new Error(
                `ReservationRecord.commit: Cannot commit a non-pending reservation (current status: ${this.reservation.status})`,
            );
        }

        if (this.isExpired()) {
            this.reservation.status = ReservationStatus.EXPIRED;
            throw new Error(
                "ReservationRecord.commit: Cannot commit an expired reservation",
            );
        }

        this.reservation.status = ReservationStatus.COMMITTED;
        if (deployId) {
            this.reservation.deployId = deployId;
        }
    }

    release(): void {
        if (!this.isPending()) {
            throw new Error(
                `ReservationRecord.release: Cannot release a non-pending reservation (current status: ${this.reservation.status})`,
            );
        }

        this.reservation.status = ReservationStatus.RELEASED;
    }

    finalize(): void {
        if (!this.isCommitted()) {
            throw new Error(
                `ReservationRecord.finalize: Cannot finalize a non-committed reservation (current status: ${this.reservation.status})`,
            );
        }

        this.reservation.status = ReservationStatus.RELEASED;
    }

    toObject(): Reservation {
        return { ...this.reservation };
    }
}
