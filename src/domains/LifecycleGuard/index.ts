import { DEFAULT_DRAIN_TIMEOUT_MS } from "@config/index";
import AutoTimer from "@domains/AutoTimer";
import LifecycleOperationGuardService from "@services/LifecycleOperationGuard";
import { EnsureNotSuspended } from "@utils/decorators/lifecycleGuard";

const DEFAULT_GENERATION: number = 0;

export default class LifecycleGuard {
    private generation: number;
    private readonly pendingOperations;
    private readonly operationsGuard: LifecycleOperationGuardService;

    constructor() {
        this.generation = DEFAULT_GENERATION;
        this.pendingOperations = new Set();
        this.operationsGuard = new LifecycleOperationGuardService();
    }

    private isCurrentGeneration(generation: number): boolean {
        return this.generation === generation;
    }

    public runExclusive<T>(operation: () => Promise<T>): Promise<T> {
        return this.operationsGuard.runExclusiveAction(operation);
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

    @EnsureNotSuspended
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
