export default class ReadWriteLock {
    private readonly sharedOperations: Set<Promise<void>> = new Set();
    private exclusiveTail: Promise<void> = Promise.resolve();

    private static settle(operation: Promise<unknown>): Promise<void> {
        return operation.then(
            () => undefined,
            () => undefined,
        );
    }

    public runShared<T>(operation: () => Promise<T>): Promise<T> {
        const result: Promise<T> = this.exclusiveTail.then(() => operation());
        const settled: Promise<void> = ReadWriteLock.settle(result);

        this.sharedOperations.add(settled);

        void settled.then(() => this.sharedOperations.delete(settled));

        return result;
    }

    public runExclusive<T>(operation: () => Promise<T>): Promise<T> {
        const pendingSharedOperations: Promise<void>[] = Array.from(
            this.sharedOperations,
        );

        const result: Promise<T> = this.exclusiveTail.then(async () => {
            await Promise.all(pendingSharedOperations);

            return operation();
        });

        this.exclusiveTail = ReadWriteLock.settle(result);

        return result;
    }
}
