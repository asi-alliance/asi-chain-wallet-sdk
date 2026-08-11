import ItemManager from "@services/ItemManager";

export default class ConcurrentOperationGuardService<
    TOwner = string,
> extends ItemManager<TOwner> {
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

    public async run<T>(
        reservations: Map<string, TOwner>,
        createConflictError: (conflictOwner: TOwner) => Error,
        operation: () => Promise<T>,
    ): Promise<T> {
        const conflictOwner: TOwner | null =
            this.findConflictOwner(reservations);

        if (conflictOwner !== null) {
            throw createConflictError(conflictOwner);
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
        }
    }
}