import SerialOperationQueue from "@services/SerialOperationQueue";

export default class KeyedSerialOperationQueue {
    private readonly queues: Map<string, SerialOperationQueue> = new Map();

    private getQueue(key: string): SerialOperationQueue {
        const queue: SerialOperationQueue =
            this.queues.get(key) ?? new SerialOperationQueue();

        this.queues.set(key, queue);

        return queue;
    }

    public run<T>(key: string, operation: () => Promise<T>): Promise<T> {
        return this.getQueue(key).run(operation);
    }
}
