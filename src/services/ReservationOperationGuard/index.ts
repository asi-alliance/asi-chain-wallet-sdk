import { NetworkId } from "@domains/Network";
import { ACCOUNT_KEY_PREFIX } from "@domains/Wallet";
import {
    ReservationAction,
    ReservationActionInProgressError,
} from "@domains/CustomError";
import ConcurrentOperationGuardService from "@services/ConcurrentOperationGuard";

export const RESERVATION_KEY_PREFIX: string = "RESERVATION";
export const DEPLOY_KEY_PREFIX: string = "DEPLOY";

export interface IReservationOperationTarget {
    accountId: string;
    networkId: NetworkId;
    deployId?: string;
    reservationId?: string;
}

export interface IReservationOperationOwner {
    action: ReservationAction;
    accountId: string;
    networkId: NetworkId;
}

export default class ReservationOperationGuardService extends ConcurrentOperationGuardService<IReservationOperationOwner> {
    private static instance: ReservationOperationGuardService;

    public static getInstance(): ReservationOperationGuardService {
        if (!ReservationOperationGuardService.instance) {
            ReservationOperationGuardService.instance =
                new ReservationOperationGuardService();
        }

        return ReservationOperationGuardService.instance;
    }

    private getAccountKey(networkId: NetworkId, accountId: string): string {
        return `${RESERVATION_KEY_PREFIX}:${ACCOUNT_KEY_PREFIX}:${networkId}:${accountId}`;
    }

    private getDeployKey(networkId: NetworkId, deployId: string): string {
        return `${RESERVATION_KEY_PREFIX}:${DEPLOY_KEY_PREFIX}:${networkId}:${deployId}`;
    }

    private getReservationKey(reservationId: string): string {
        return `${RESERVATION_KEY_PREFIX}:${reservationId}`;
    }

    private getGuardedKeys(
        action: ReservationAction,
        {
            accountId,
            networkId,
            deployId,
            reservationId,
        }: IReservationOperationTarget,
    ): Map<string, IReservationOperationOwner> {
        const owner: IReservationOperationOwner = {
            action,
            accountId,
            networkId,
        };

        const guardedKeys: Map<string, IReservationOperationOwner> = new Map([
            [this.getAccountKey(networkId, accountId), owner],
        ]);

        if (deployId) {
            guardedKeys.set(this.getDeployKey(networkId, deployId), owner);
        }

        if (reservationId) {
            guardedKeys.set(this.getReservationKey(reservationId), owner);
        }

        return guardedKeys;
    }

    public async runReservationAction<T>(
        action: ReservationAction,
        target: IReservationOperationTarget,
        operation: () => Promise<T>,
    ): Promise<T> {
        return this.run(
            this.getGuardedKeys(action, target),
            (conflictOwner: IReservationOperationOwner) =>
                new ReservationActionInProgressError(
                    conflictOwner.action,
                    conflictOwner.accountId,
                    conflictOwner.networkId,
                ),
            operation,
        );
    }
}
