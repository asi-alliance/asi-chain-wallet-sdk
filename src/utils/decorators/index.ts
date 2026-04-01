import BlockchainGateway from "@domains/BlockchainGateway";

/**
 * Decorator that ensures BlockchainGateway is initialized before method execution (Stage 3)
 * Throws an error if BlockchainGateway has not been initialized via BlockchainGateway.init()
 */
export function RequireBlockchainGateway<T>(
    value: Function,
    context: ClassMethodDecoratorContext,
) {
    return function (this: T, ...methodArguments: any[]): any {
        if (!BlockchainGateway.isInitialized()) {
            throw new Error(
                `${context.kind} ${String(context.name)}: BlockchainGateway is not initialized. Call BlockchainGateway.init() first.`,
            );
        }

        return value.apply(this, methodArguments);
    };
}
