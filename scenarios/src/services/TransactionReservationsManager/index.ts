import ApiServiceRegistry from "../../domains/ApiServiceRegistry";
import { IDeployWatchHandle, IDeployWatchOptions } from "../DeployStatusPoller";
import { ITransactionReservation } from "../../domains/Transaction";

export interface ITransactionReservationsManagerOptions {
    onConfirmed?: (reservation: ITransactionReservation) => void;
    watchOptions?: IDeployWatchOptions;
}

export default class TransactionReservationsManager {
    private readonly reservations: Map<string, ITransactionReservation> =
        new Map();
    private readonly watchers: Map<string, IDeployWatchHandle> = new Map();

    private readonly onConfirmed?: (
        reservation: ITransactionReservation,
    ) => void;
    private readonly watchOptions?: IDeployWatchOptions;

    constructor(
        reservations: ITransactionReservation[],
        options: ITransactionReservationsManagerOptions = {},
    ) {
        this.onConfirmed = options.onConfirmed;
        this.watchOptions = options.watchOptions;

        for (const reservation of reservations) {
            this.reservations.set(reservation.id, reservation);
            this.watch(reservation);
        }
    }

    public add(reservation: ITransactionReservation): void {
        this.reservations.set(reservation.id, reservation);
        this.watch(reservation);
    }

    public remove(id: string): boolean {
        this.stopWatch(id);

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

        this.reservations.clear();
    }

    private watch(reservation: ITransactionReservation): void {
        if (!reservation.deployId) {
            return;
        }

        const handle: IDeployWatchHandle =
            ApiServiceRegistry.getInstance().poller.watch(
                reservation.deployId,
                {
                    onConfirmed: () => this.handleConfirmed(reservation),
                },
                this.watchOptions,
            );

        this.watchers.set(reservation.id, handle);
    }

    private stopWatch(id: string): void {
        this.watchers.get(id)?.cancel();
        this.watchers.delete(id);
    }

    private handleConfirmed(reservation: ITransactionReservation): void {
        this.reservations.delete(reservation.id);
        this.watchers.delete(reservation.id);

        this.onConfirmed?.(reservation);
    }
}
