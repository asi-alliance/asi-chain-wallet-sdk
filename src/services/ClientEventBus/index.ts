import Account from "@domains/Account";
import { INetworkRecord, NetworkId } from "@domains/Network";
import { TReservationsByWallet } from "@domains/Transaction";
import Wallet from "@domains/Wallet";
import { runProtected } from "@utils/functions";

export enum ClientEvent {
    WALLETS_CHANGED = "walletsChanged",
    ACCOUNTS_CHANGED = "accountsChanged",
    NETWORK_CHANGED = "networkChanged",
    RESERVATIONS_CHANGED = "reservationsChanged",
    NETWORK_BUSY_CHANGED = "networkBusyChanged",
    WALLET_LOCKED = "walletLocked",
}

export interface IClientEventMap {
    [ClientEvent.WALLETS_CHANGED]: [wallets: Wallet[]];
    [ClientEvent.ACCOUNTS_CHANGED]: [walletId: string, accounts: Account[]];
    [ClientEvent.NETWORK_CHANGED]: [network: INetworkRecord];
    [ClientEvent.RESERVATIONS_CHANGED]: [
        reservationsByWallet: TReservationsByWallet,
    ];
    [ClientEvent.NETWORK_BUSY_CHANGED]: [networkId: NetworkId, isBusy: boolean];
    [ClientEvent.WALLET_LOCKED]: [walletId: string];
}

export type TClientEventName = keyof IClientEventMap;

export type TClientEventListener<TName extends TClientEventName> = (
    ...payload: IClientEventMap[TName]
) => void | Promise<void>;

export type TUnsubscribe = () => void;

export type TClientEventListenerErrorHandler = (
    name: TClientEventName,
    error: unknown,
) => void | Promise<void>;

export interface IClientEventSource {
    on<TName extends TClientEventName>(
        name: TName,
        listener: TClientEventListener<TName>,
    ): TUnsubscribe;
    off<TName extends TClientEventName>(
        name: TName,
        listener: TClientEventListener<TName>,
    ): void;
}

export default class ClientEventBus implements IClientEventSource {
    private readonly listeners: Map<TClientEventName, Set<unknown>> = new Map();
    private readonly onListenerError?: TClientEventListenerErrorHandler;
    private readonly source: IClientEventSource;

    constructor(onListenerError?: TClientEventListenerErrorHandler) {
        this.onListenerError = onListenerError;
        this.source = this.createSource();
    }

    private createSource(): IClientEventSource {
        return Object.freeze({
            on: <TName extends TClientEventName>(
                name: TName,
                listener: TClientEventListener<TName>,
            ): TUnsubscribe => this.on(name, listener),
            off: <TName extends TClientEventName>(
                name: TName,
                listener: TClientEventListener<TName>,
            ): void => this.off(name, listener),
        });
    }

    public getSource(): IClientEventSource {
        return this.source;
    }

    public on<TName extends TClientEventName>(
        name: TName,
        listener: TClientEventListener<TName>,
    ): TUnsubscribe {
        const bucket: Set<unknown> =
            this.listeners.get(name) ?? new Set<unknown>();

        bucket.add(listener);
        this.listeners.set(name, bucket);

        return () => this.off(name, listener);
    }

    public off<TName extends TClientEventName>(
        name: TName,
        listener: TClientEventListener<TName>,
    ): void {
        this.listeners.get(name)?.delete(listener);
    }

    private reportListenerError(name: TClientEventName, error: unknown): void {
        runProtected(
            () => this.onListenerError?.(name, error),
            (handlerError: unknown) => {
                console.error(
                    `ClientEventBus: error handler failed for "${name}"`,
                    handlerError,
                );
            },
        );
    }

    private notify<TName extends TClientEventName>(
        name: TName,
        listener: TClientEventListener<TName>,
        payload: IClientEventMap[TName],
    ): void {
        runProtected(
            () => listener(...payload),
            (error: unknown) => this.reportListenerError(name, error),
        );
    }

    public emit<TName extends TClientEventName>(
        name: TName,
        ...payload: IClientEventMap[TName]
    ): void {
        const bucket: Set<unknown> | undefined = this.listeners.get(name);

        if (!bucket) {
            return;
        }

        const listeners = Array.from(bucket) as TClientEventListener<TName>[];

        for (const listener of listeners) {
            this.notify(name, listener, payload);
        }
    }

    public clear(): void {
        this.listeners.clear();
    }
}