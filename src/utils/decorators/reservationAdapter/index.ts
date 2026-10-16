import { IClosable } from "@domains/ClosableDomain";
import { DomainClosedError } from "@domains/CustomError";

export interface IReservationsManagerContext {
    reservationsManager: IClosable;
}

export function EnsureReservationsManagerActive<
    This extends IReservationsManagerContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (!this.reservationsManager.isActive()) {
            throw new DomainClosedError(this.constructor.name);
        }

        return target.apply(this, args);
    };
}
