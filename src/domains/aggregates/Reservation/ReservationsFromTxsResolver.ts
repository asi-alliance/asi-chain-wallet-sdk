import { Address } from "@domains/Wallet";
import ReservationRecord from ".";
import { Transaction } from "../Transaction";
import { toAtomicAmount } from "@utils";

/**
 * In SDK, the concepts of transactions and reservations are closely related. This necessitates their consistency. This includes consistency in the methods used to update them (graphql or ReadOnly node), and consistency in the timing of their updates.
 * This domain service implements this approach: reservations depend only on local transactions. They are calculated based on them.
 */
export class ReservationsFromTxsResolver {
    private static obtainReservationFromTx(tx: Transaction) {
        let reservation: ReservationRecord | undefined;
        if(tx.status === "pending" && tx.type !== "receive") {
            reservation = ReservationRecord.create(tx.from as Address, toAtomicAmount(tx.amount ?? ""), undefined, tx.deployId, undefined);
        }
        return reservation;
    }
    /**
     * @param walletLocalTxs local transactions filtered by network and address
     * @returns reservations of address with network
     */
    public static resolveFromTxs(walletLocalTxs: Transaction[]): ReservationRecord[] {
        const reservations: ReservationRecord[] = [];
        for(const localTx of walletLocalTxs) {
            const reservation = this.obtainReservationFromTx(localTx);
            if(reservation) {
                reservations.push(reservation);
            }
        }
        return reservations;    
    }
}