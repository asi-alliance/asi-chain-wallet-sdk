import { Address } from "../Wallet";

export enum ReservationStatus {
    PENDING = "PENDING",
    COMMITTED = "COMMITTED",
    RELEASED = "RELEASED",
    EXPIRED = "EXPIRED",
}

export interface Reservation {
    id: string;
    address: Address;
    amount: bigint;
    status: ReservationStatus;
    createdAt: number;
    expiresAt: number;
    deployId?: string; // Optional: link to a deploy operation
    reason?: string; // Optional: description of why funds are reserved
}

export interface ReservationResult {
    reservationId: string;
    address: Address;
    amount: bigint;
    status: ReservationStatus;
}
