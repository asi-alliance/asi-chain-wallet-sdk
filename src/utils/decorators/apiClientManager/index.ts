import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import NetworkBusyRegistry from "@domains/NetworkBusyRegistry";
import { NetworkBusyError } from "@domains/CustomError";
import { NetworkId } from "@domains/Network";

export interface IApiClientManagerContext {
    isReady(): boolean;
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
