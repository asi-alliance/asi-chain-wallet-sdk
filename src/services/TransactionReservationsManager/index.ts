import ItemManager from "@services/ItemManager";
import { IDisposable } from "./../DisposableItemManager/index";
import { DEPLOY_STATUS_POLLING_TIMEOUT } from "@config/index";
import ApiClientManager from "@domains/ApiClientManager";
import { NetworkId } from "@domains/Network";
import { IDeployStatusResult } from "@domains/Deploy";
import { ITransactionReservation } from "@domains/Transaction";
import DeployStatusPoller, {
    IDeployConfirmedResult,
    IDeployWatchCallbacks,
    IDeployWatchHandle,
    IDeployWatchOptions,
} from "@services/DeployStatusPoller";
import { EnsureExclusiveReservation } from "@utils/decorators/transactionReservationsManager";

export interface ITransactionReservationsManagerOptions {
    onAdded?: (reservation: ITransactionReservation) => void;
    onReplaced?: (reservation: ITransactionReservation) => void;
    onRemoved?: (reservation: ITransactionReservation) => void;
    onConfirmed?: (reservation: ITransactionReservation) => void;
    onExpired?: (reservation: ITransactionReservation) => void;
    onFailed?: (reservation: ITransactionReservation, error: Error) => void;
    watchCallbacks?: IDeployWatchCallbacks;
    watchOptions?: IDeployWatchOptions;
}

export default class TransactionReservationsManager
    extends ItemManager<ITransactionReservation>
    implements IDisposable
{
    private readonly watchers: Map<string, IDeployWatchHandle> = new Map();
    private readonly subscribers: Map<string, Set<IDeployWatchCallbacks>> =
        new Map();
    private readonly expirationTimers: Map<
        string,
        ReturnType<typeof setTimeout>
    > = new Map();
    private readonly exclusiveIds: Set<string> = new Set();

    private readonly onAdded?: (reservation: ITransactionReservation) => void;
    private readonly onReplaced?: (
        reservation: ITransactionReservation,
    ) => void;
    private readonly onRemoved?: (reservation: ITransactionReservation) => void;
    private readonly onConfirmed?: (
        reservation: ITransactionReservation,
    ) => void;
    private readonly onExpired?: (reservation: ITransactionReservation) => void;
    private readonly onFailed?: (
        reservation: ITransactionReservation,
        error: Error,
    ) => void;
    private readonly watchCallbacks?: IDeployWatchCallbacks;
    private readonly watchOptions?: IDeployWatchOptions;

    constructor(
        reservations: ITransactionReservation[],
        options: ITransactionReservationsManagerOptions = {},
    ) {
        super();

        this.onAdded = options.onAdded;
        this.onReplaced = options.onReplaced;
        this.onRemoved = options.onRemoved;
        this.onConfirmed = options.onConfirmed;
        this.onExpired = options.onExpired;
        this.onFailed = options.onFailed;
        this.watchCallbacks = options.watchCallbacks;
        this.watchOptions = {
            ...options.watchOptions,
            timeoutMs:
                options.watchOptions?.timeoutMs ??
                DEPLOY_STATUS_POLLING_TIMEOUT,
        };

        for (const reservation of reservations) {
            this.track(reservation.id, reservation);
        }
    }

    public add(id: string, reservation: ITransactionReservation): void {
        this.track(id, reservation);

        this.onAdded?.(reservation);
    }

    public getKnown(id: string): ITransactionReservation {
        const targetReservation: ITransactionReservation | null = this.get(id);

        if (!targetReservation) {
            throw new Error(
                `TransactionReservationsManager.getKnown: not found reservation ${id}`,
            );
        }

        return targetReservation;
    }

    @EnsureExclusiveReservation
    public replace(reservation: ITransactionReservation): void {
        this.getKnown(reservation.id);

        super.add(reservation.id, reservation);

        this.onReplaced?.(reservation);
    }

    public isExclusiveReservation(id: string): boolean {
        return this.exclusiveIds.has(id);
    }

    public async runExclusive<T>(
        id: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        this.getKnown(id);

        this.exclusiveIds.add(id);
        this.cancelWatch(id);
        this.clearExpiration(id);

        try {
            return await operation();
        } finally {
            this.exclusiveIds.delete(id);
            this.rearm(id);
        }
    }

    private untrack(id: string): ITransactionReservation {
        const targetReservation: ITransactionReservation = super.remove(id);

        this.stopWatch(id);
        this.clearExpiration(id);

        return targetReservation;
    }

    public remove(id: string): ITransactionReservation {
        const targetReservation: ITransactionReservation = this.untrack(id);

        this.onRemoved?.(targetReservation);

        return targetReservation;
    }

    public getByNetworkId(networkId: NetworkId): ITransactionReservation[] {
        return this.getByFilter(
            (reservation: ITransactionReservation) =>
                reservation.networkId === networkId,
        );
    }

    public removeByNetworkId(networkId: NetworkId): ITransactionReservation[] {
        return this.getByNetworkId(networkId).map(
            (reservation: ITransactionReservation) =>
                this.untrack(reservation.id),
        );
    }

    public ensureUniqueDeployId(
        deployId: string,
        networkId: NetworkId,
        excludedReservationId?: string,
    ): void {
        const hasDuplicate: boolean = this.hasByFilter(
            (reservation: ITransactionReservation) =>
                reservation.details.deployId === deployId &&
                reservation.networkId === networkId &&
                reservation.id !== excludedReservationId,
        );

        if (hasDuplicate) {
            throw new Error(
                `TransactionReservationsManager.ensureUniqueDeployId: reservation for deploy ${deployId} already exists`,
            );
        }
    }

    public subscribe(
        reservationId: string,
        callbacks: IDeployWatchCallbacks,
    ): () => void {
        const reservationSubscribers: Set<IDeployWatchCallbacks> =
            this.subscribers.get(reservationId) ?? new Set();

        reservationSubscribers.add(callbacks);
        this.subscribers.set(reservationId, reservationSubscribers);

        return () => {
            reservationSubscribers.delete(callbacks);
        };
    }

    public getByAccountId(
        accountId: string,
        networkId: NetworkId,
    ): ITransactionReservation[] {
        return this.getByFilter(
            (reservation: ITransactionReservation) =>
                reservation.networkId === networkId &&
                reservation.accountId === accountId,
        );
    }

    public dispose(): void {
        for (const id of Array.from(this.watchers.keys())) {
            this.stopWatch(id);
        }

        for (const id of Array.from(this.expirationTimers.keys())) {
            this.clearExpiration(id);
        }

        this.subscribers.clear();
        this.clear();
    }

    private track(id: string, reservation: ITransactionReservation): void {
        super.add(id, reservation);

        this.watch(reservation);
        this.scheduleExpiration(reservation);
    }

    private watch(reservation: ITransactionReservation): void {
        const { deployId } = reservation.details;

        const poller: DeployStatusPoller = new DeployStatusPoller(
            ApiClientManager.getInstance().createNetworkContext(
                reservation.networkId,
            ),
        );

        const handle: IDeployWatchHandle = poller.watch(
            deployId,
            {
                onStatus: (status: IDeployStatusResult, deployId: string) =>
                    this.notify(reservation.id, (callbacks) =>
                        callbacks.onStatus?.(status, deployId),
                    ),
                onConfirmed: (result: IDeployConfirmedResult) => {
                    this.notify(reservation.id, (callbacks) =>
                        callbacks.onConfirmed?.(result),
                    );

                    this.handleConfirmed(reservation);
                },
                onError: (error: Error) => {
                    this.notify(reservation.id, (callbacks) =>
                        callbacks.onError?.(error),
                    );

                    this.handleFailed(reservation, error);
                },
            },
            this.watchOptions,
        );

        this.watchers.set(reservation.id, handle);
    }

    private notify(
        reservationId: string,
        invoke: (callbacks: IDeployWatchCallbacks) => void,
    ): void {
        if (this.watchCallbacks) {
            invoke(this.watchCallbacks);
        }

        this.subscribers.get(reservationId)?.forEach(invoke);
    }

    private scheduleExpiration(reservation: ITransactionReservation): void {
        const delay: number = reservation.expirationTime - Date.now();

        if (delay <= 0) {
            this.handleExpired(reservation);

            return;
        }

        const timer: ReturnType<typeof setTimeout> = setTimeout(
            () => this.handleExpired(reservation),
            delay,
        );

        this.expirationTimers.set(reservation.id, timer);
    }

    private rearm(id: string): void {
        const targetReservation: ITransactionReservation | null = this.get(id);

        if (!targetReservation) {
            return;
        }

        this.watch(targetReservation);
        this.scheduleExpiration(targetReservation);
    }

    private cancelWatch(id: string): void {
        this.watchers.get(id)?.cancel();
        this.watchers.delete(id);
    }

    private stopWatch(id: string): void {
        this.cancelWatch(id);
        this.subscribers.delete(id);
    }

    private clearExpiration(id: string): void {
        const timer: ReturnType<typeof setTimeout> | undefined =
            this.expirationTimers.get(id);

        if (timer) {
            clearTimeout(timer);
            this.expirationTimers.delete(id);
        }
    }

    private handleConfirmed(reservation: ITransactionReservation): void {
        this.stopWatch(reservation.id);
        this.clearExpiration(reservation.id);
        this.items.delete(reservation.id);

        this.onConfirmed?.(reservation);
    }

    private handleExpired(reservation: ITransactionReservation): void {
        this.stopWatch(reservation.id);
        this.clearExpiration(reservation.id);
        this.items.delete(reservation.id);

        this.onExpired?.(reservation);
    }

    private handleFailed(
        reservation: ITransactionReservation,
        error: Error,
    ): void {
        this.stopWatch(reservation.id);

        this.onFailed?.(reservation, error);
    }
}
