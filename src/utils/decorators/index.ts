import BlockchainGateway from "@domains/BlockchainGateway";

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
