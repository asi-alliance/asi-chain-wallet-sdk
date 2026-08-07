import { IClientEventDispatcher } from "@domains/Client";
import {
    ClientEvent,
    IClientEventSource,
    TClientEventListener,
    TClientEventName,
    TUnsubscribe,
} from "@services/ClientEventBus";

export const registerEventDispatcher = (
    eventBus: IClientEventSource,
    eventDispatcher: IClientEventDispatcher,
): TUnsubscribe => {
    const unsubscribes: TUnsubscribe[] = [];

    const register = <TName extends TClientEventName>(
        name: TName,
        listener?: TClientEventListener<TName>,
    ): void => {
        if (!listener) {
            return;
        }

        unsubscribes.push(eventBus.on(name, listener));
    };

    register(
        ClientEvent.WALLETS_CHANGED,
        eventDispatcher.onWalletsChanged?.bind(eventDispatcher),
    );
    register(
        ClientEvent.ACCOUNTS_CHANGED,
        eventDispatcher.onAccountsChanged?.bind(eventDispatcher),
    );
    register(
        ClientEvent.NETWORK_CHANGED,
        eventDispatcher.onNetworkChanged?.bind(eventDispatcher),
    );
    register(
        ClientEvent.RESERVATIONS_CHANGED,
        eventDispatcher.onReservationsChanged?.bind(eventDispatcher),
    );
    register(
        ClientEvent.NETWORK_BUSY_CHANGED,
        eventDispatcher.onNetworkBusyChanged?.bind(eventDispatcher),
    );
    register(
        ClientEvent.WALLET_LOCKED,
        eventDispatcher.onWalletLocked?.bind(eventDispatcher),
    );

    return () => {
        for (const unsubscribe of unsubscribes) {
            unsubscribe();
        }

        unsubscribes.length = 0;
    };
};