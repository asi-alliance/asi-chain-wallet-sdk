import { NetworkId } from "@domains/Network";
import { ACCOUNT_KEY_PREFIX } from "@domains/Wallet";
import {
    ReservationAction,
    ReservationActionInProgressError,
} from "@domains/CustomError";
import ConcurrentOperationGuardService, {
    IOperationScope,
    OperationScopeMode,
} from "@services/ConcurrentOperationGuard";

export const RESERVATION_KEY_PREFIX: string = "RESERVATION";
export const DEPLOY_KEY_PREFIX: string = "DEPLOY";
export const NETWORK_KEY_PREFIX: string = "NETWORK";

export interface IReservationOperationTarget {
    accountId: string;
    networkId: NetworkId;
    deployId?: string;
    reservationId?: string;
}

export interface IReservationOperationOwner {
    action: ReservationAction;
    networkId: NetworkId;
    accountId?: string;
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

    private getNetworkKey(networkId: NetworkId): string {
        return `${RESERVATION_KEY_PREFIX}:${NETWORK_KEY_PREFIX}:${networkId}`;
    }

    public hasNetworkScope(networkId: NetworkId): boolean {
        return this.hasExclusiveScope(this.getNetworkKey(networkId));
    }

    private getGuardedKeys(
        owner: IReservationOperationOwner,
        {
            accountId,
            networkId,
            deployId,
            reservationId,
        }: IReservationOperationTarget,
    ): Map<string, IReservationOperationOwner> {
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

    private createConflictError(
        conflictOwner: IReservationOperationOwner,
    ): Error {
        return new ReservationActionInProgressError(
            conflictOwner.action,
            conflictOwner.networkId,
            conflictOwner.accountId,
        );
    }

    public async runReservationAction<T>(
        action: ReservationAction,
        target: IReservationOperationTarget,
        operation: () => Promise<T>,
    ): Promise<T> {
        const owner: IReservationOperationOwner = {
            action,
            networkId: target.networkId,
            accountId: target.accountId,
        };

        const scope: IOperationScope<IReservationOperationOwner> = {
            key: this.getNetworkKey(target.networkId),
            mode: OperationScopeMode.SHARED,
            owner,
        };

        return this.run(
            this.getGuardedKeys(owner, target),
            this.createConflictError,
            operation,
            scope,
        );
    }

    public async runNetworkReservationAction<T>(
        action: ReservationAction,
        networkId: NetworkId,
        operation: () => Promise<T>,
    ): Promise<T> {
        const scope: IOperationScope<IReservationOperationOwner> = {
            key: this.getNetworkKey(networkId),
            mode: OperationScopeMode.EXCLUSIVE,
            owner: { action, networkId },
        };

        return this.run(new Map(), this.createConflictError, operation, scope);
    }
}
