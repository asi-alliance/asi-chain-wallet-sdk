import ItemManager from "@services/ItemManager";

export enum OperationScopeMode {
    SHARED = "SHARED",
    EXCLUSIVE = "EXCLUSIVE",
}

export interface IOperationScope<TOwner> {
    key: string;
    mode: OperationScopeMode;
    owner: TOwner;
}

export default class ConcurrentOperationGuardService<
    TOwner = string,
> extends ItemManager<TOwner> {
    private readonly sharedScopeHolders: Map<string, Map<symbol, TOwner>> =
        new Map();
    private readonly exclusiveScopeHolders: Map<string, TOwner> = new Map();

    private findConflictOwner(
        reservations: Map<string, TOwner>,
    ): TOwner | null {
        for (const key of reservations.keys()) {
            const owner: TOwner | null = this.get(key);

            if (owner !== null) {
                return owner;
            }
        }

        return null;
    }

    private findScopeConflictOwner({
        key,
        mode,
    }: IOperationScope<TOwner>): TOwner | null {
        const exclusiveHolder: TOwner | undefined =
            this.exclusiveScopeHolders.get(key);

        if (exclusiveHolder !== undefined) {
            return exclusiveHolder;
        }

        if (mode === OperationScopeMode.SHARED) {
            return null;
        }

        const sharedHolders: Map<symbol, TOwner> | undefined =
            this.sharedScopeHolders.get(key);

        return sharedHolders?.values().next().value ?? null;
    }

    private acquireScope(
        { key, mode, owner }: IOperationScope<TOwner>,
        token: symbol,
    ): void {
        if (mode === OperationScopeMode.EXCLUSIVE) {
            this.exclusiveScopeHolders.set(key, owner);

            return;
        }

        const sharedHolders: Map<symbol, TOwner> =
            this.sharedScopeHolders.get(key) ?? new Map();

        sharedHolders.set(token, owner);
        this.sharedScopeHolders.set(key, sharedHolders);
    }

    private releaseScope(
        { key, mode }: IOperationScope<TOwner>,
        token: symbol,
    ): void {
        if (mode === OperationScopeMode.EXCLUSIVE) {
            this.exclusiveScopeHolders.delete(key);

            return;
        }

        const sharedHolders: Map<symbol, TOwner> | undefined =
            this.sharedScopeHolders.get(key);

        sharedHolders?.delete(token);

        if (sharedHolders?.size === 0) {
            this.sharedScopeHolders.delete(key);
        }
    }

    public async run<T>(
        reservations: Map<string, TOwner>,
        createConflictError: (conflictOwner: TOwner) => Error,
        operation: () => Promise<T>,
        scope?: IOperationScope<TOwner>,
    ): Promise<T> {
        const conflictOwner: TOwner | null =
            (scope ? this.findScopeConflictOwner(scope) : null) ??
            this.findConflictOwner(reservations);

        if (conflictOwner !== null) {
            throw createConflictError(conflictOwner);
        }

        const scopeToken: symbol = Symbol("operationScope");

        if (scope) {
            this.acquireScope(scope, scopeToken);
        }

        for (const [key, owner] of reservations) {
            this.add(key, owner);
        }

        try {
            return await operation();
        } finally {
            for (const key of reservations.keys()) {
                this.remove(key);
            }

            if (scope) {
                this.releaseScope(scope, scopeToken);
            }
        }
    }
}