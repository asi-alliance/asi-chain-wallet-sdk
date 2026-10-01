import { ITransactionReservation } from "@domains/Transaction";

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
