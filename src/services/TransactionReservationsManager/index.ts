import { IDisposable } from "./../DisposableItemManager/index";
import { DEPLOY_STATUS_POLLING_TIMEOUT } from "@config/index";
import ApiClientManager from "@domains/ApiClientManager";
import { ITransactionReservation } from "@domains/Transaction";
import DeployStatusPoller, {
    IDeployConfirmedResult,
    IDeployWatchCallbacks,
    IDeployWatchHandle,
    IDeployWatchOptions,
} from "@services/DeployStatusPoller";

export interface ITransactionReservationsManagerOptions {
    onConfirmed?: (reservation: ITransactionReservation) => void;
    onExpired?: (reservation: ITransactionReservation) => void;
    onFailed?: (reservation: ITransactionReservation, error: Error) => void;
    watchCallbacks?: IDeployWatchCallbacks;
    watchOptions?: IDeployWatchOptions;
}

export default class TransactionReservationsManager implements IDisposable {
    private readonly reservations: Map<string, ITransactionReservation> =
        new Map();
    private readonly watchers: Map<string, IDeployWatchHandle> = new Map();
    private readonly expirationTimers: Map<
        string,
        ReturnType<typeof setTimeout>
    > = new Map();

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
            this.track(reservation);
        }
    }

    public add(reservation: ITransactionReservation): void {
        this.track(reservation);
    }

    public remove(id: string): boolean {
        this.stopWatch(id);
        this.clearExpiration(id);

        return this.reservations.delete(id);
    }

    public get(id: string): ITransactionReservation | null {
        return this.reservations.get(id) ?? null;
    }

    public getAll(): ITransactionReservation[] {
        return Array.from(this.reservations.values());
    }

    public getByAccountId(accountId: string): ITransactionReservation[] {
        return this.getAll().filter(
            (reservation: ITransactionReservation) =>
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

        this.reservations.clear();
    }

    private track(reservation: ITransactionReservation): void {
        this.reservations.set(reservation.id, reservation);
        this.watch(reservation);
        this.scheduleExpiration(reservation);
    }

    private watch(reservation: ITransactionReservation): void {
        if (!reservation.deployId) {
            return;
        }

        const poller: DeployStatusPoller = new DeployStatusPoller(
            ApiClientManager.getInstance().createNetworkContext(
                reservation.networkId,
            ),
        );

        const handle: IDeployWatchHandle = poller.watch(
            reservation.deployId,
            {
                ...this.watchCallbacks,
                onConfirmed: (result: IDeployConfirmedResult) => {
                    this.watchCallbacks?.onConfirmed?.(result);

                    this.handleConfirmed(reservation);
                },
                onError: (error: Error) => {
                    this.watchCallbacks?.onError?.(error);

                    this.handleFailed(reservation, error);
                },
            },
            this.watchOptions,
        );

        this.watchers.set(reservation.id, handle);
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

    private stopWatch(id: string): void {
        this.watchers.get(id)?.cancel();
        this.watchers.delete(id);
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
        this.reservations.delete(reservation.id);

        this.onConfirmed?.(reservation);
    }

    private handleExpired(reservation: ITransactionReservation): void {
        this.stopWatch(reservation.id);
        this.clearExpiration(reservation.id);
        this.reservations.delete(reservation.id);

        this.onExpired?.(reservation);
    }

    private handleFailed(
        reservation: ITransactionReservation,
        error: Error,
    ): void {
        this.stopWatch(reservation.id);
        this.clearExpiration(reservation.id);
        this.reservations.delete(reservation.id);

        this.onFailed?.(reservation, error);
    }
}
