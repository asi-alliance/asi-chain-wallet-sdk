import { ITransactionReservation } from "@domains/Transaction";
import { DomainClosedError } from "@domains/CustomError";
import { IDeployWatchCallbacks } from "@services/DeployStatusPoller";
import { IClosableContext } from "@utils/decorators";

export interface IExclusiveReservationContext {
    isExclusiveReservation(id: ITransactionReservation["id"]): boolean;
}

export function EnsureExclusiveReservation<
    This extends IExclusiveReservationContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        const { id } = args[0] as ITransactionReservation;

        if (!this.isExclusiveReservation(id)) {
            throw new Error(
                `TransactionReservationsManager.${String(context.name)}: reservation ${id} can be changed only inside runExclusive`,
            );
        }

        return target.apply(this, args);
    };
}

export function FailSubscriptionWhenInactive<
    This extends IClosableContext,
    Args extends [string, IDeployWatchCallbacks],
>(
    target: (...args: Args) => () => void,
    _context: ClassMethodDecoratorContext,
) {
    return function (this: This, ...args: Args): () => void {
        const [, callbacks] = args;

        if (!this.isActive()) {
            callbacks.onError?.(new DomainClosedError(this.constructor.name));

            return () => {};
        }

        return target.apply(this, args);
    };
}
