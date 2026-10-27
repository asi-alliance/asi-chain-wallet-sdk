import ReadWriteLock from "@services/ReadWriteLock";

export default class KeyedReadWriteLock {
    private readonly locks: Map<string, ReadWriteLock> = new Map();

    private getLock(key: string): ReadWriteLock {
        const lock: ReadWriteLock = this.locks.get(key) ?? new ReadWriteLock();

        this.locks.set(key, lock);

        return lock;
    }

    public runShared<T>(key: string, operation: () => Promise<T>): Promise<T> {
        return this.getLock(key).runShared(operation);
    }

    public runExclusive<T>(
        key: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        return this.getLock(key).runExclusive(operation);
    }
}
