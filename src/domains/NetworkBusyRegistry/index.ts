import { NetworkId } from "@domains/Network";

export default class NetworkBusyRegistry {
    private readonly counters: Map<NetworkId, number> = new Map();

    public acquire(networkId: NetworkId): void {
        this.counters.set(networkId, this.getCounter(networkId) + 1);
    }

    public release(networkId: NetworkId): void {
        const counter: number = this.getCounter(networkId) - 1;

        if (counter <= 0) {
            this.counters.delete(networkId);

            return;
        }

        this.counters.set(networkId, counter);
    }

    public isBusy(networkId: NetworkId): boolean {
        return this.getCounter(networkId) > 0;
    }

    public clear(): void {
        this.counters.clear();
    }

    private getCounter(networkId: NetworkId): number {
        return this.counters.get(networkId) ?? 0;
    }
}