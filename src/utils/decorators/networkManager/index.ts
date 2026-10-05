import ApiClientManager from "@domains/ApiClientManager";
import { NetworkBusyError } from "@domains/CustomError";
import { NetworkId } from "@domains/Network";

export function EnsureNetworkIsIdle<
    This,
    Args extends [NetworkId, ...any[]],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        const [networkId] = args;

        if (ApiClientManager.getInstance().isNetworkBusy(networkId)) {
            throw new NetworkBusyError(networkId);
        }

        return target.apply(this, args);
    };
}
