import { DEFAULT_DRAIN_TIMEOUT_MS } from "@config/index";
import AutoTimer from "@domains/AutoTimer";

export default class LifecycleGuard {
    private generation: number = 0;
    private readonly pendingOperations: Set<Promise<unknown>> = new Set();

    private isCurrentGeneration(generation: number): boolean {
        return this.generation === generation;
    }

    public invalidate(): void {
        this.generation++;
    }

    public async drain(timeoutMs?: number): Promise<void> {
        if (!this.pendingOperations.size) {
            return;
        }

        let resolveTimeout: () => void = () => {};

        const timeout: Promise<void> = new Promise<void>((resolve) => {
            resolveTimeout = resolve;
        });

        const timer: AutoTimer = new AutoTimer({
            delayMs: timeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS,
            onElapsed: () => resolveTimeout(),
        });

        timer.start();

        try {
            await Promise.race([
                Promise.allSettled(Array.from(this.pendingOperations)),
                timeout,
            ]);
        } finally {
            timer.clear();
        }
    }

    public async track<T>(operation: () => Promise<T>): Promise<T> {
        const pendingOperation: Promise<T> = operation();

        this.pendingOperations.add(pendingOperation);

        try {
            return await pendingOperation;
        } finally {
            this.pendingOperations.delete(pendingOperation);
        }
    }

    public async run<T>(
        operation: () => Promise<T>,
        onInvalidated: (result: T) => Error,
    ): Promise<T> {
        const generation: number = this.generation;

        const result: T = await this.track(operation);

        if (this.isCurrentGeneration(generation)) {
            return result;
        }

        throw onInvalidated(result);
    }
}
