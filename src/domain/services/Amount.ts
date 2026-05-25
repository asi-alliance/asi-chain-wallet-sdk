import { GasFeeVO, ReservationRecord } from "..";
import { FeeService } from "@/application/services/Fee";
import { ReservationDomainService } from "./Reservation/ReservationDomainService";

export class Amount {
    /**
     * @returns amount + estimated gas fee
     */
    public static getEstimatedTotalTransferAmount(amount: bigint, gasFee: GasFeeVO = FeeService.getGasFeeVO()) {
        return amount + gasFee.gasFee;
    }
    /**
     * @returns amount + max possible gas fee
     */
    public static getMaxTotalTransferAmount(amount: bigint, gasFee: GasFeeVO = FeeService.getGasFeeVO()) {
        return amount + gasFee.gasFeeRange.max;
    }
    /**
     * @param balance balance of wallet that was received from ReadOnly node
     * @param reservations reservations for network+address 
     * @returns the balance that remains available after all reservations have been taken into account
     */
    public static getAvailableBalance(balance: bigint, reservations: ReservationRecord[]) {
        const totalReserved = ReservationDomainService.getTotalReserved(reservations);
        return balance - totalReserved;
    }
}