import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import NetworkBusyRegistry from "@domains/NetworkBusyRegistry";
import {
    NetworkBusyError,
    ReservationAction,
    ReservationActionInProgressError,
} from "@domains/CustomError";
import { NetworkId } from "@domains/Network";
import ReservationOperationGuardService from "@services/ReservationOperationGuard";
import type { INetworkOperationOptions } from "@domains/ApiClientManager";

export interface IApiClientManagerContext {
    isReady(): boolean;
}

export interface IApiClientManagerCurrentNetworkContext {
    getCurrentNetworkId(): NetworkId;
}

export interface IApiClientManagerConfigContext {
    networkConfigProvider: NetworkConfigProvider;
}

export interface IApiClientManagerBusyContext
    extends IApiClientManagerContext {
    networkBusyRegistry: NetworkBusyRegistry;
    getCurrentNetworkId(): NetworkId;
}

export function EnsureApiClientManagerInitialized<
    This extends IApiClientManagerContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (!this.isReady()) {
            throw new Error("ApiClientManager is not initialized");
        }

        return target.apply(this, args);
    };
}

export function EnsureApiClientManagerConfigured<
    This extends IApiClientManagerConfigContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (!this.networkConfigProvider.isReady()) {
            throw new Error("ApiClientManager config is not initialized");
        }

        return target.apply(this, args);
    };
}

export function EnsureCurrentNetworkNotBusy<
    This extends IApiClientManagerBusyContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (!this.isReady()) {
            return target.apply(this, args);
        }

        const currentNetworkId: NetworkId = this.getCurrentNetworkId();

        if (this.networkBusyRegistry.isBusy(currentNetworkId)) {
            throw new NetworkBusyError(currentNetworkId);
        }

        return target.apply(this, args);
    };
}

export function EnsureTargetNetworkNotBusy<
    This extends IApiClientManagerBusyContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        const networkId = args[0] as NetworkId;

        if (this.networkBusyRegistry.isBusy(networkId)) {
            throw new NetworkBusyError(networkId);
        }

        return target.apply(this, args);
    };
}

export function EnsureNetworkNotReconfiguring<
    This extends IApiClientManagerCurrentNetworkContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        const { networkId }: INetworkOperationOptions = args[1] ?? {};

        const targetNetworkId: NetworkId =
            networkId ?? this.getCurrentNetworkId();

        if (
            ReservationOperationGuardService.getInstance().hasNetworkScope(
                targetNetworkId,
            )
        ) {
            throw new ReservationActionInProgressError(
                ReservationAction.NETWORK_CLEANUP,
                targetNetworkId,
            );
        }

        return target.apply(this, args);
    };
}
