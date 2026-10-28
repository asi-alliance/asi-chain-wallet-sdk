import { OperationsSuspendedError } from "@domains/CustomError";
import LifecycleOperationGuardService from "@services/LifecycleOperationGuard";

export interface ILifecycleGuardContext {
    operationsGuard: LifecycleOperationGuardService;
}

export function EnsureNotSuspended<
    This extends ILifecycleGuardContext,
    Args extends any[],
    Return,
>(
    target: (...args: Args) => Promise<Return>,
    _context: ClassMethodDecoratorContext,
) {
    return async function (this: This, ...args: Args): Promise<Return> {
        if (this.operationsGuard.isSuspended()) {
            throw new OperationsSuspendedError();
        }

        return target.apply(this, args);
    };
}
