import LifecycleGuard from "@domains/LifecycleGuard";

export default class KeyedLifecycleGuardService {
    private readonly guards: Map<string, LifecycleGuard> = new Map();

    private getGuard(key: string): LifecycleGuard {
        const guard: LifecycleGuard =
            this.guards.get(key) ?? new LifecycleGuard();

        this.guards.set(key, guard);

        return guard;
    }

    public track<T>(key: string, operation: () => Promise<T>): Promise<T> {
        return this.getGuard(key).track(operation);
    }

    public async drain(key: string, timeoutMs?: number): Promise<void> {
        await this.guards.get(key)?.drain(timeoutMs);
    }
}
