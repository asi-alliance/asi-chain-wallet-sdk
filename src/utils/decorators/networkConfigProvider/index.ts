import type { INetworkRecord, NetworkId } from "@domains/Network";

interface INetworkConfigProviderContext {
    isReady(): boolean;
    networksRecords: Map<NetworkId, INetworkRecord> | null;
}

export function EnsureNetworkConfigProviderReady<
    This extends INetworkConfigProviderContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (!this.isReady()) {
            throw new Error("Network config is not ready");
        }

        return target.apply(this, args);
    };
}

export function EnsureNetworkExist<
    This extends INetworkConfigProviderContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        const networkId: NetworkId = args[0];

        if (!this.networksRecords?.get(networkId)) {
            throw new Error("Network config is not found");
        }

        return target.apply(this, args);
    };
}

export function EnsureNetworkNotDefault<
    This extends INetworkConfigProviderContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        const networkId: NetworkId = args[0];
        const targetNetworkRecord: INetworkRecord =
            this.networksRecords!.get(networkId)!;

        if (targetNetworkRecord.isDefault) {
            throw new Error("Network config is not default");
        }

        return target.apply(this, args);
    };
}
