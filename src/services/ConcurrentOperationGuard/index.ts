import ItemManager from "@services/ItemManager";

export default class ConcurrentOperationGuardService extends ItemManager<string> {
    private findConflictOwnerId(keys: string[]): string | null {
        for (const key of keys) {
            const ownerId: string | null = this.get(key);

            if (ownerId) {
                return ownerId;
            }
        }

        return null;
    }

    public async run<T>(
        keys: string[],
        ownerId: string,
        createConflictError: (conflictOwnerId: string) => Error,
        operation: () => Promise<T>,
    ): Promise<T> {
        const conflictOwnerId: string | null = this.findConflictOwnerId(keys);

        if (conflictOwnerId) {
            throw createConflictError(conflictOwnerId);
        }

        for (const key of keys) {
            this.add(key, ownerId);
        }

        try {
            return await operation();
        } finally {
            for (const key of keys) {
                this.remove(key);
            }
        }
    }
}