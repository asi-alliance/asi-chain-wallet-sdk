import { NetworkId } from "@domains/Network";

export interface IExclusiveNetworkContext {
    isExclusiveNetwork(networkId: NetworkId): boolean;
}

export function EnsureExclusiveNetwork<
    This extends IExclusiveNetworkContext,
    Args extends [NetworkId, ...any[]],
    Return,
>(
    target: (...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext,
) {
    return async function (this: This, ...args: Args): Promise<Return> {
        const [networkId] = args;

        if (!this.isExclusiveNetwork(networkId)) {
            throw new Error(
                `ReservationAdapterManager.${String(context.name)}: reservations of network ${networkId} can be changed only inside runExclusiveNetworkAction`,
            );
        }

        return target.apply(this, args);
    };
}
