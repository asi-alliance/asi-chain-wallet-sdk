export default class SerialOperationQueue {
    private tail: Promise<void> = Promise.resolve();

    public run<T>(operation: () => Promise<T>): Promise<T> {
        const result: Promise<T> = this.tail.then(() => operation());

        this.tail = result.then(
            () => undefined,
            () => undefined,
        );

        return result;
    }
}
