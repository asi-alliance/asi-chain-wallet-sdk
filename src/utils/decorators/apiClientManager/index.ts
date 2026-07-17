import NetworkConfigProvider from "@domains/NetworkConfigProvider";

export interface IApiClientManagerContext {
    isReady(): boolean;
}

export interface IApiClientManagerConfigContext {
    networkConfigProvider: NetworkConfigProvider;
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
